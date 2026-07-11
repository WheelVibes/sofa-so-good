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

import type { Camera, Object3D, Scene, Texture, WebGLRenderer } from 'three'
import { mmToFov } from '../cameras/cameraLensSettings'
import { aiDenoiseEligible } from './hqAiDenoiseMath'
import type { HqAovImages } from './hqAovPasses'
import { classifyProbePixels, HqBlankRenderError } from './hqBlankProbe'
import { isReusableEquirectEnvironment } from './hqEnvironment'
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
  /** AI denoise (PHOTO-DENOISE, `hqAiDenoise` flag): arm the OIDN U-Net pass —
   *  cheap albedo/normal AOV guides are captured at session start and
   *  `applyAiDenoise()` becomes available once samples exist. The edge-blur
   *  `denoise` blit stays on as the live preview + fallback. */
  aiDenoise?: boolean
  /** Equirect `.hdr` URL to light the still with (PHOTO-HDRI-PT) — the user's
   *  active `hdriEnvironment` selection, resolved via `hqEnvironmentUrl`.
   *  Undefined → the neutral 2-colour gradient sky (procedural mode). */
  hdriUrl?: string
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
  /** PNG of the current accumulation state (the AI-denoised frame once
   *  `applyAiDenoise()` has succeeded). */
  toDataURL: () => string
  /** Run the OIDN AI denoise over the accumulated frame (PHOTO-DENOISE).
   *  Resolves with the denoised canvas, or null when the pass is disabled,
   *  ineligible (8K), or failed — callers keep the edge-blur preview then.
   *  Idempotent-ish: a second call re-runs over the current accumulation. */
  applyAiDenoise: () => Promise<HTMLCanvasElement | null>
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

/**
 * PT-BLANK-GUARD readback: sample a sparse `grid`×`grid` of 1-px reads across
 * the tracer's drawing buffer (valid post-blit — the session's renderer is
 * created with `preserveDrawingBuffer: true`). ~16 single-pixel `readPixels`
 * calls, one-shot after the first sample — negligible next to a path-trace
 * sample. Classified by the pure `classifyProbePixels`.
 */
function readCanvasProbePixels(renderer: WebGLRenderer, width: number, height: number): Uint8Array {
  const grid = 4
  const gl = renderer.getContext()
  const out = new Uint8Array(grid * grid * 4)
  let i = 0
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.min(width - 1, Math.floor(((gx + 0.5) / grid) * width))
      const y = Math.min(height - 1, Math.floor(((gy + 0.5) / grid) * height))
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out.subarray(i, i + 4))
      i += 4
    }
  }
  return out
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
 * The environment the tracer is lit by when an HDRI is active (PHOTO-HDRI-PT):
 * reuse the live `scene.environment` when it's already the loaded equirect
 * (Medium+ tiers — never disposed here, the live scene still owns it), else
 * load the `.hdr` directly (flat tier keeps `scene.environment` null). Any
 * load failure (offline / headless) → null, so callers fall back to the
 * gradient instead of crashing.
 */
async function resolveTracerEnvironment(
  live: Scene,
  hdriUrl: string | undefined,
): Promise<{ tex: Texture; owned: boolean } | null> {
  if (!hdriUrl) return null
  if (isReusableEquirectEnvironment(live.environment))
    return { tex: live.environment, owned: false }
  try {
    const [{ RGBELoader }, three] = await Promise.all([
      import('three/examples/jsm/loaders/RGBELoader.js'),
      import('three'),
    ])
    const tex = await new RGBELoader().loadAsync(hdriUrl)
    tex.mapping = three.EquirectangularReflectionMapping
    return { tex, owned: true }
  } catch {
    return null
  }
}

/**
 * Snapshot the live scene into a tracer-safe static Scene: world-baked clones
 * of every visible mesh with a standard material (geometry + materials shared
 * by reference — cheap), plus simple copies of the punctual lights and a
 * neutral gradient sky for ambience — or, when the user has an HDRI
 * environment active, that captured equirect instead (PHOTO-HDRI-PT,
 * importance-sampled by the tracer). Custom-shader overlays (grid, outlines,
 * contact shadows), lines, sprites and the PMREM probe environment are
 * deliberately excluded — the converter can't ingest them (undefined uniform
 * reads) and they aren't part of a photoreal still anyway.
 */
async function buildTracerScene(
  live: Scene,
  hdriUrl?: string,
): Promise<{ root: Scene; ownedEnv: Texture | null }> {
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

  // The user's captured HDRI when one is active (PHOTO-HDRI-PT) — the same
  // environment the real-time IBL uses, importance-sampled by the tracer —
  // else a soft gradient sky instead of the live PMREM probe (whose
  // render-target texture the converter can't read).
  const env = await resolveTracerEnvironment(live, hdriUrl)
  if (env) {
    root.environment = env.tex
    root.background = env.tex
    return { root, ownedEnv: env.owned ? env.tex : null }
  }
  const sky = new GradientEquirectTexture()
  sky.topColor.set(0xbfd4e6)
  sky.bottomColor.set(0x5a5650)
  sky.update()
  root.environment = sky
  root.background = sky
  return { root, ownedEnv: null }
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

  let ownedEnv: Texture | null = null
  // Albedo + normal guide AOVs for the AI denoiser (PHOTO-DENOISE) — captured
  // one-shot below, right after the BVH snapshot, while the snapshot scene is
  // in scope. Null → colour-only denoise (still valid OIDN input).
  let aovs: HqAovImages | null = null
  const wantAiDenoise = opts.aiDenoise === true && aiDenoiseEligible(opts.width, opts.height)
  try {
    // Snapshot the live scene + camera pose into the tracer's BVH.
    const built = await buildTracerScene(scene, opts.hdriUrl)
    const snapshot = built.root
    ownedEnv = built.ownedEnv
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
    if (wantAiDenoise) {
      // Cheap raster passes into offscreen targets — they never touch the
      // canvas drawing buffer the tracer accumulates into. Best-effort: a
      // failure only downgrades the AI pass to colour-only.
      try {
        const { captureAovPasses } = await import('./hqAovPasses')
        aovs = await captureAovPasses(renderer, snapshot, renderCamera, opts.width, opts.height)
      } catch {
        aovs = null
      }
    }
  } catch (err) {
    ownedEnv?.dispose()
    renderer.dispose()
    // Free the failed context's GPU slot immediately (see disposeSession).
    try {
      renderer.forceContextLoss()
    } catch {
      // context already gone
    }
    opts.onError?.(err)
    throw err
  }

  let samples = 0
  let raf = 0
  let running = false
  let disposed = false
  let probed = false
  // The OIDN AI-denoised frame (PHOTO-DENOISE): a plain 2D canvas so
  // toDataURL/preview never depend on another GL context. Cleared whenever
  // accumulation resumes (it would be stale against newer samples).
  let denoisedCanvas: HTMLCanvasElement | null = null
  let denoising = false

  const disposeSession = () => {
    if (disposed) return
    disposed = true
    running = false
    cancelAnimationFrame(raf)
    tracer.dispose?.()
    // Only a texture this session loaded itself — never the live scene's.
    ownedEnv?.dispose()
    renderer.dispose()
    // Explicitly lose the offscreen context (three wraps WEBGL_lose_context —
    // same pattern as ui/WebGLFallback.tsx) so its GPU slot frees NOW instead
    // of at GC. Browsers cap live WebGL contexts, and on drivers where the
    // megakernel fails validation the dead tracer context can otherwise starve
    // the MAIN canvas's next context until ContextLossGuard's restore path
    // kicks in — this cooperates with that guard (frees the slot proactively)
    // rather than duplicating its restore listeners. The canvas is dedicated
    // and never reused, so losing its context is side-effect free.
    try {
      renderer.forceContextLoss()
    } catch {
      // context already lost
    }
  }

  const tick = () => {
    if (!running || disposed) return
    try {
      tracer.renderSample()
      samples = Math.floor(tracer.samples)
      opts.onProgress?.(samples, opts.maxSamples)
    } catch (err) {
      // A throwing renderSample means the tracer is unusable — free the GL
      // context promptly rather than waiting for the modal's teardown.
      disposeSession()
      opts.onError?.(err)
      return
    }
    // PT-BLANK-GUARD: one-shot pixel probe. On drivers where the megakernel
    // fails GLSL validation (e.g. WSL D3D12/ANGLE — Shader Error 1282, empty
    // info log), renderSample no-ops silently (samples still count up) and the
    // canvas stays uniformly black/white — abort with a recognisable error
    // instead of "finishing" a blank render. The probe normally waits for the
    // first FULL sample (a mid-sample canvas has un-rendered tiles that could
    // read as black), but when the very first tick leaves errors in the GL
    // queue — the failure mode's signature — it fires immediately, cutting the
    // invalid-draw spam that gets the whole page flagged for context loss.
    // `probed` guarantees a healthy session is never re-probed (and can never
    // be aborted mid-flight); a failed/odd readback classifies as 'ok' so the
    // probe itself can't kill a working render.
    if (!probed) {
      let ready = samples >= 1
      if (!ready) {
        try {
          const gl = renderer.getContext()
          ready = gl.getError() !== gl.NO_ERROR
        } catch {
          // context gone — the next renderSample will throw and dispose
        }
      }
      if (ready) {
        probed = true
        let verdict: ReturnType<typeof classifyProbePixels> = 'ok'
        try {
          verdict = classifyProbePixels(readCanvasProbePixels(renderer, opts.width, opts.height))
        } catch {
          // readback failed — never abort on missing evidence
        }
        if (verdict === 'blank') {
          disposeSession()
          opts.onError?.(new HqBlankRenderError())
          return
        }
      }
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
      denoisedCanvas = null
      running = true
      raf = requestAnimationFrame(tick)
    },
    stop: () => {
      running = false
      cancelAnimationFrame(raf)
    },
    toDataURL: () =>
      denoisedCanvas ? denoisedCanvas.toDataURL('image/png') : canvas.toDataURL('image/png'),
    applyAiDenoise: async () => {
      if (!wantAiDenoise || disposed || denoising || samples === 0) return denoisedCanvas
      denoising = true
      try {
        const { runAiDenoise } = await import('./hqAiDenoise')
        const img = await runAiDenoise(canvas, aovs, () => disposed)
        if (disposed) return null
        const out = document.createElement('canvas')
        out.width = img.width
        out.height = img.height
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.putImageData(img, 0, 0)
        denoisedCanvas = out
        return out
      } catch (err) {
        // Every backend failed (or cancelled) — the edge-blur preview stands.
        if (import.meta.env.DEV) console.warn('HQ AI denoise failed:', err)
        return null
      } finally {
        denoising = false
      }
    },
    dispose: disposeSession,
  }
}
