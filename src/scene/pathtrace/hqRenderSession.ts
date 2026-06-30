/**
 * Progressive path-traced "HQ render" session (F1) — the marquee one-click
 * photoreal still, built on `three-gpu-pathtracer` (MIT). The session owns a
 * DEDICATED offscreen canvas + WebGLRenderer at the target resolution, so the
 * live raster pipeline (demand frameloop, post stack, quality tiers) is never
 * touched; the library itself is dynamic-imported so its ~MB of shader code
 * stays out of the boot bundle (P-CHUNK rule).
 *
 * Lifecycle: create → samples accumulate on rAF (one `renderSample` per tick,
 * progress callback per sample) → `toDataURL()` any time → `dispose()` frees
 * the context. The BVH snapshot is taken at creation; later scene edits don't
 * affect a running render (it's a still).
 */

import type { Camera, Object3D, Scene } from 'three'
import { mmToFov } from '../cameras/cameraLensSettings'
import { HQ_TRACER_CONFIG } from './hqTracerConfig'

export interface HqRenderOptions {
  width: number
  height: number
  /** Stop after this many accumulated samples (quality ↔ time). */
  maxSamples: number
  /** Photographic depth of field (F5): aperture f-stop; undefined/0 = off
   *  (pinhole). When > 0, focus is either `focusDistance` (if provided) or auto —
   *  the first surface at screen centre. */
  fStop?: number
  /** Lens focal length (mm, 35 mm-equivalent). Overrides the live camera FOV via
   *  `mmToFov` when provided (PC2-CAM-DOF-LENS). Only applied when DoF is on. */
  focalLengthMm?: number
  /** Manual focus distance (metres). When provided (with `fStop` > 0), overrides
   *  the centre-screen auto-focus raycast. Undefined → auto-focus. */
  focusDistance?: number
  /** Edge-preserving denoise blit on the preview/output (default true) —
   *  smooths Monte-Carlo noise at low sample counts. */
  denoise?: boolean
  /** Called after every sample with (done, max). */
  onProgress?: (samples: number, maxSamples: number) => void
  /** Called once accumulation reaches maxSamples. */
  onDone?: () => void
  /** Called when the scene snapshot/compile fails (renderer freed). */
  onError?: (err: unknown) => void
}

export interface HqRenderSession {
  /** The canvas samples accumulate into — append it for a live preview. */
  readonly canvas: HTMLCanvasElement
  /** Samples accumulated so far. */
  readonly samples: number
  /** Pause accumulation (resume with start()). */
  stop: () => void
  start: () => void
  /** PNG of the current accumulation state. */
  toDataURL: () => string
  /** Stop + free the GL context and path-tracer resources. */
  dispose: () => void
}

/** Clamp options to sane GPU-safe bounds (pure — unit-tested). */
export function clampHqOptions(o: { width: number; height: number; maxSamples: number }): {
  width: number
  height: number
  maxSamples: number
} {
  const dim = (v: number) => Math.max(64, Math.min(4096, Math.round(v) || 64))
  return {
    width: dim(o.width),
    height: dim(o.height),
    maxSamples: Math.max(1, Math.min(4096, Math.round(o.maxSamples) || 1)),
  }
}

/** Material kinds the path tracer's converter understands. Anything else
 *  (custom shaders, line/sprite materials) is skipped from the snapshot. */
function isTraceableMaterial(m: unknown): boolean {
  const mat = m as {
    isMeshStandardMaterial?: boolean
    isMeshPhysicalMaterial?: boolean
    isMeshBasicMaterial?: boolean
    isMeshLambertMaterial?: boolean
    isMeshPhongMaterial?: boolean
  }
  return Boolean(
    mat &&
      (mat.isMeshStandardMaterial ||
        mat.isMeshPhysicalMaterial ||
        mat.isMeshBasicMaterial ||
        mat.isMeshLambertMaterial ||
        mat.isMeshPhongMaterial),
  )
}

/**
 * Snapshot the live scene into a tracer-safe static Scene: world-baked clones
 * of every visible mesh with a standard material (geometry + materials shared
 * by reference — cheap), plus simple copies of the punctual lights and a
 * neutral gradient sky for ambience. Custom-shader overlays (grid, outlines,
 * contact shadows), lines, sprites and the PMREM probe environment are
 * deliberately excluded — the converter can't ingest them (undefined uniform
 * reads) and they aren't part of a photoreal still anyway.
 */
async function buildTracerScene(live: Scene): Promise<Scene> {
  const three = await import('three')
  const { GradientEquirectTexture } = await import('three-gpu-pathtracer')
  const root = new three.Scene()

  live.updateMatrixWorld(true)
  live.traverse((obj: Object3D) => {
    // Respect the visibility chain (hidden levels/items must not render).
    let p: Object3D | null = obj
    while (p) {
      if (!p.visible) return
      p = p.parent
    }
    const mesh = obj as {
      isMesh?: boolean
      isInstancedMesh?: boolean
      geometry?: unknown
      material?: unknown
    }
    if (mesh.isMesh && !mesh.isInstancedMesh && mesh.geometry && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (!mats.every(isTraceableMaterial)) return
      const src = obj as InstanceType<typeof three.Mesh>
      const clone = new three.Mesh(src.geometry, src.material)
      clone.matrixAutoUpdate = false
      clone.matrix.copy(src.matrixWorld)
      root.add(clone)
      return
    }
    const light = obj as {
      isDirectionalLight?: boolean
      isPointLight?: boolean
      isSpotLight?: boolean
    }
    if (light.isDirectionalLight || light.isPointLight || light.isSpotLight) {
      const src = obj as InstanceType<typeof three.Light> & { target?: Object3D }
      const copy = src.clone(false) as typeof src
      copy.matrixAutoUpdate = false
      copy.matrix.copy(src.matrixWorld)
      if (light.isDirectionalLight && src.target) {
        // Re-aim the clone the same way (targets live outside the subtree).
        const t = new three.Object3D()
        src.target.getWorldPosition(t.position)
        root.add(t)
        ;(copy as unknown as { target: Object3D }).target = t
      }
      root.add(copy)
    }
  })

  // Soft sky ambience instead of the live PMREM probe (whose render-target
  // texture the converter can't read).
  const sky = new GradientEquirectTexture()
  sky.topColor.set(0xbfd4e6)
  sky.bottomColor.set(0x5a5650)
  sky.update()
  root.environment = sky
  root.background = sky
  return root
}

/**
 * Create a session over a snapshot of `scene` from `camera`'s current pose.
 * Heavy: builds the path-tracing BVH synchronously inside (call from an async
 * UI affordance). Throws if WebGL2 is unavailable.
 */
export async function createHqRenderSession(
  scene: Scene,
  camera: Camera,
  optsIn: HqRenderOptions,
): Promise<HqRenderSession> {
  const opts = { ...optsIn, ...clampHqOptions(optsIn) }
  const [{ WebGLPathTracer, PhysicalCamera }, three] = await Promise.all([
    import('three-gpu-pathtracer'),
    import('three'),
  ])
  const { WebGLRenderer, ACESFilmicToneMapping } = three

  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  const renderer = new WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
  renderer.setSize(opts.width, opts.height, false)
  renderer.toneMapping = ACESFilmicToneMapping

  const tracer = new WebGLPathTracer(renderer)
  // Interior-tuned quality (PHOTO-PT-TUNE): enough transmissive bounces that
  // glass isn't black, glossy filtering to kill sun-through-glass fireflies, and
  // MIS for faster convergence. Set before setScene so material/uniform changes
  // apply from the first sample. Guarded so a lib API change can't break the
  // render (falls back to library defaults).
  try {
    tracer.bounces = HQ_TRACER_CONFIG.bounces
    tracer.transmissiveBounces = HQ_TRACER_CONFIG.transmissiveBounces
    tracer.filterGlossyFactor = HQ_TRACER_CONFIG.filterGlossyFactor
    tracer.multipleImportanceSampling = HQ_TRACER_CONFIG.multipleImportanceSampling
    // `stableNoise` exists at runtime but isn't in this lib version's d.ts.
    ;(tracer as { stableNoise?: boolean }).stableNoise = HQ_TRACER_CONFIG.stableNoise
  } catch {
    // keep library defaults
  }
  // Edge-preserving denoise on the canvas blit (the lib's DenoiseMaterial —
  // a smart blur that respects geometry edges). Falls back to the plain blit
  // if construction fails so a lib upgrade can't break rendering.
  if (opts.denoise !== false) {
    try {
      const { DenoiseMaterial } = await import('three-gpu-pathtracer')
      const { FullScreenQuad } = await import('three/examples/jsm/postprocessing/Pass.js')
      const mat = new DenoiseMaterial({ blending: three.NoBlending })
      mat.sigma = 2.5
      mat.threshold = 0.1
      mat.kSigma = 1.0
      const quad = new FullScreenQuad(mat)
      tracer.renderToCanvasCallback = (target, rend) => {
        mat.map = target.texture
        const prevAutoClear = rend.autoClear
        rend.autoClear = false
        quad.render(rend)
        rend.autoClear = prevAutoClear
      }
    } catch {
      // keep the default blit
    }
  }
  // Tiled rendering keeps each rAF tick short so the tab stays responsive
  // during big renders (one tile per tick instead of a whole sample) —
  // scale tiles with resolution, min 2×2, max 6×6.
  const tiles = Math.max(2, Math.min(6, Math.ceil(Math.max(opts.width, opts.height) / 640)))
  tracer.tiles.set(tiles, tiles)
  tracer.minSamples = 0

  try {
    // Snapshot the live scene + camera pose into the tracer's BVH.
    const snapshot = await buildTracerScene(scene)
    let renderCamera: Camera = camera
    if (opts.fStop && opts.fStop > 0) {
      // Photographic camera (F5 + PC2-CAM-DOF-LENS): clone the live pose into the
      // tracer's PhysicalCamera. The vertical FOV is either the chosen lens focal
      // length (mm → fov) or the live camera's. Focus is the user's manual focus
      // distance when given, else auto on the first surface at screen centre
      // (3 m when looking at sky/nothing) so the subject stays sharp.
      const live = camera as InstanceType<typeof three.PerspectiveCamera>
      const fov =
        opts.focalLengthMm && opts.focalLengthMm > 0
          ? mmToFov(opts.focalLengthMm)
          : (live.fov ?? 50)
      const phys = new PhysicalCamera(fov, opts.width / opts.height, 0.05, 300)
      phys.position.copy(live.position)
      phys.quaternion.copy(live.quaternion)
      phys.updateMatrixWorld(true)
      phys.fStop = opts.fStop
      if (opts.focusDistance && opts.focusDistance > 0) {
        phys.focusDistance = opts.focusDistance
      } else {
        const ray = new three.Raycaster()
        ray.setFromCamera(new three.Vector2(0, 0), live)
        const hit = ray.intersectObjects(snapshot.children, true)[0]
        phys.focusDistance = hit ? hit.distance : 3
      }
      renderCamera = phys
    }
    tracer.setScene(snapshot, renderCamera)
  } catch (err) {
    renderer.dispose()
    opts.onError?.(err)
    throw err
  }

  let samples = 0
  let raf = 0
  let running = false
  let disposed = false

  const tick = () => {
    if (!running || disposed) return
    try {
      tracer.renderSample()
      samples = Math.floor(tracer.samples)
      opts.onProgress?.(samples, opts.maxSamples)
    } catch (err) {
      running = false
      opts.onError?.(err)
      return
    }
    if (samples >= opts.maxSamples) {
      running = false
      opts.onDone?.()
      return
    }
    raf = requestAnimationFrame(tick)
  }

  return {
    canvas,
    get samples() {
      return samples
    },
    start: () => {
      if (running || disposed) return
      running = true
      raf = requestAnimationFrame(tick)
    },
    stop: () => {
      running = false
      cancelAnimationFrame(raf)
    },
    toDataURL: () => canvas.toDataURL('image/png'),
    dispose: () => {
      if (disposed) return
      disposed = true
      running = false
      cancelAnimationFrame(raf)
      tracer.dispose?.()
      renderer.dispose()
    },
  }
}
