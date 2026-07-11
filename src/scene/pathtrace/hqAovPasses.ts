/**
 * One-shot albedo + normal AOV guide passes for the HQ render's AI denoiser
 * (PHOTO-DENOISE). Rendered from the tracer's *snapshot* scene with the
 * session's own offscreen renderer right after the BVH is built (before the
 * first path-traced sample), so the live raster pipeline is never touched and
 * the tracer's accumulated canvas is never overwritten (render-target passes
 * don't touch the drawing buffer).
 *
 * OIDN's guided models want a noise-free albedo (base colour, unlit) and a
 * normal buffer. Cheap raster approximations are exactly what the model was
 * trained against: `MeshBasicMaterial` clones carrying each mesh's colour/map,
 * and a `MeshNormalMaterial` override (view-space normals, encoded 0..1 — the
 * `denoiser` package remaps normals to [-1,1] itself via its isNormalMap path).
 *
 * Readback rows come out bottom-up (GL convention) — returned as ImageData with
 * `flipY: true` so the consumer passes the flip flag to the denoiser instead of
 * shuffling megabytes on the CPU.
 */

import type { Camera, Scene, WebGLRenderer } from 'three'

export interface HqAovImages {
  albedo: ImageData
  normal: ImageData
  /** Rows are bottom-up (GL readback) — tell the denoiser to flip on ingest. */
  flipY: true
}

/**
 * Render the two guide AOVs and read them back. Any failure (context trouble,
 * exotic material) returns null — the caller falls back to colour-only denoise.
 */
export async function captureAovPasses(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
): Promise<HqAovImages | null> {
  const three = await import('three')
  const target = new three.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  // Swapped-in albedo materials, cached per source material so shared
  // materials are cloned once.
  const albedoCache = new Map<unknown, InstanceType<typeof three.MeshBasicMaterial>>()
  const swapped: Array<{ mesh: { material: unknown }; original: unknown }> = []
  const normalOverride = new three.MeshNormalMaterial()

  const prevTarget = renderer.getRenderTarget()
  const prevToneMapping = renderer.toneMapping
  const prevAutoClear = renderer.autoClear
  const prevClearColor = new three.Color()
  renderer.getClearColor(prevClearColor)
  const prevClearAlpha = renderer.getClearAlpha()
  const prevBackground = scene.background
  const prevOverride = scene.overrideMaterial

  const readPass = (): ImageData => {
    const bytes = new Uint8ClampedArray(width * height * 4)
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      width,
      height,
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    )
    return new ImageData(bytes, width, height)
  }

  try {
    renderer.toneMapping = three.NoToneMapping
    renderer.autoClear = true
    renderer.setRenderTarget(target)
    scene.background = null

    // Albedo: unlit base colour per mesh (colour + map), white sky.
    const toBasic = (m: unknown): InstanceType<typeof three.MeshBasicMaterial> => {
      let basic = albedoCache.get(m)
      if (!basic) {
        const src = m as { color?: { getHex?: () => number }; map?: unknown }
        basic = new three.MeshBasicMaterial()
        if (src.color?.getHex) basic.color.setHex(src.color.getHex())
        if (src.map) basic.map = src.map as never
        basic.toneMapped = false
        albedoCache.set(m, basic)
      }
      return basic
    }
    scene.traverse((obj) => {
      const mesh = obj as { isMesh?: boolean; material?: unknown }
      if (!mesh.isMesh || !mesh.material) return
      swapped.push({ mesh: mesh as { material: unknown }, original: mesh.material })
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(toBasic)
        : toBasic(mesh.material)
    })
    renderer.setClearColor(0xffffff, 1)
    renderer.render(scene, camera)
    const albedo = readPass()
    for (const s of swapped) s.mesh.material = s.original
    swapped.length = 0

    // Normals: view-space via the override material, neutral facing-camera sky.
    scene.overrideMaterial = normalOverride
    renderer.setClearColor(0x8080ff, 1)
    renderer.render(scene, camera)
    const normal = readPass()

    return { albedo, normal, flipY: true }
  } catch {
    return null
  } finally {
    for (const s of swapped) s.mesh.material = s.original
    scene.overrideMaterial = prevOverride
    scene.background = prevBackground
    renderer.setRenderTarget(prevTarget)
    renderer.toneMapping = prevToneMapping
    renderer.autoClear = prevAutoClear
    renderer.setClearColor(prevClearColor, prevClearAlpha)
    for (const m of albedoCache.values()) m.dispose()
    normalOverride.dispose()
    target.dispose()
  }
}
