import {
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { applyAnisotropy } from './anisotropy'
import {
  effectivePatternSize,
  generateProcedural,
  getPlasterNormal,
  getProceduralBaseSize,
} from './procedural/generators'
import { proceduralWorkerKey, requestProceduralWorker } from './procedural/runProceduralWorker'
import { notifyProceduralSwap } from './proceduralSwapSignal'
import type { MaterialDef, ProceduralPattern } from './types'

/** Module-level material cache keyed by MaterialId. Each cached
 *  MeshStandardMaterial is reused across every mesh that applies the
 *  same finish so the GPU uploads textures once. */
const CACHE = new Map<string, MeshStandardMaterial>()

/** Returns the cached material for a MaterialId, or undefined. */
export function getCachedMaterial(id: string): MeshStandardMaterial | undefined {
  return CACHE.get(id)
}

/** Returns the BUILT material for a MaterialId regardless of its kind:
 *  procedural materials cache under `id@<generation size>` (so a quality-tier
 *  change regenerates them — see `buildMaterial`), everything else under the
 *  plain id. Callers that only have the id (e.g. a furniture `mat:<id>`
 *  finish) must use this — a plain `getCachedMaterial(id)` permanently misses
 *  procedural builds and the finish silently stays on its fallback.
 *
 *  Note: since smooth patterns always cap at 256 regardless of BASE_SIZE,
 *  their cache keys are always `id@256`; checking only `id@BASE_SIZE` would
 *  miss them on Medium+ tiers. We probe both suffixes to handle that. */
export function getBuiltMaterial(id: string): MeshStandardMaterial | undefined {
  return CACHE.get(id) ?? CACHE.get(`${id}@${getProceduralBaseSize()}`) ?? CACHE.get(`${id}@256`)
}

/**
 * Build a Three.js CanvasTexture from an ImageBitmap received from the worker.
 * Frees the bitmap after drawing it to the canvas.
 */
function imageBitmapToTexture(
  bmp: ImageBitmap,
  srgb: boolean,
  uvScale: [number, number],
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  if (srgb) tex.colorSpace = SRGBColorSpace
  applyAnisotropy(tex)
  tex.repeat.set(1 / uvScale[0], 1 / uvScale[1])
  tex.needsUpdate = true
  return tex
}

/**
 * Request off-thread generation of a procedural texture set and hot-swap the
 * material's maps when the worker resolves. If the worker is unavailable or
 * errors, the sync fallback textures already in place are kept.
 *
 * After swapping, `notifyProceduralSwap()` fires the global signal so the
 * scene (demand-mode canvas) renders a fresh frame to show the new textures.
 * `needsUpdate` is set on each swapped texture so Three.js re-uploads to GPU.
 */
async function scheduleWorkerUpgrade(
  mat: MeshStandardMaterial,
  matId: string,
  pattern: ProceduralPattern,
  swatch: string,
  size: number,
  uvScale: [number, number],
  _key: string,
): Promise<void> {
  const result = await requestProceduralWorker(matId, pattern, swatch, size)
  if (!result) return // worker unavailable / errored — keep sync fallback

  // Materialise all three textures. If anything throws the existing sync
  // textures are untouched.
  try {
    const albedo = imageBitmapToTexture(result.albedo, true, uvScale)
    const normal = imageBitmapToTexture(result.normal, false, uvScale)
    const roughness = imageBitmapToTexture(result.roughness, false, uvScale)

    // Dispose the old sync-generated textures to free GPU memory.
    mat.map?.dispose()
    mat.normalMap?.dispose()
    mat.roughnessMap?.dispose()

    mat.map = albedo
    mat.normalMap = normal
    mat.roughnessMap = roughness
    mat.metalness = result.metalness
    mat.needsUpdate = true

    // Signal demand-mode canvas to render the freshly upgraded frame.
    notifyProceduralSwap()
  } catch {
    // Upgrade failed — sync fallback textures remain. No-op.
  }
}

/** Constructs and caches a new material for the given def. The caller
 *  is responsible for passing already-loaded textures (or none for a
 *  solid material). */
export function buildMaterial(
  def: MaterialDef,
  textures?: { albedo?: Texture; normal?: Texture; roughness?: Texture; ao?: Texture },
): MeshStandardMaterial {
  // Procedural materials carry the effective generation size in the key so a
  // quality-tier change regenerates at the new size instead of serving a stale
  // one. Smooth patterns (carpet, concrete, …) cap at 256 regardless of tier —
  // their key always ends in @256 so Medium+ hits the same cached texture.
  const cacheKey =
    def.kind === 'procedural' && def.pattern !== 'plaster'
      ? `${def.id}@${effectivePatternSize(def.pattern)}`
      : def.id
  const existing = CACHE.get(cacheKey)
  if (existing) return existing

  const m = new MeshStandardMaterial({
    color: def.swatch,
    roughness: 0.85,
    metalness: 0.0,
  })
  if (def.kind === 'procedural' && def.pattern === 'plaster') {
    // Painted plaster: shared normal + flat tint (no per-material textures).
    const normal = getPlasterNormal()
    m.color.set(def.swatch)
    m.roughness = 0.92
    m.normalMap = normal
    m.normalScale.set(0.4, 0.4)
    CACHE.set(cacheKey, m)
    return m
  }
  if (def.kind === 'procedural') {
    const size = effectivePatternSize(def.pattern)
    const maps = generateProcedural(def.id, def.pattern, def.swatch)
    m.color.set('#ffffff') // tint baked into albedo
    m.map = maps.albedo
    m.normalMap = maps.normal
    m.roughnessMap = maps.roughness
    m.metalness = maps.metalness
    for (const t of [maps.albedo, maps.normal, maps.roughness]) {
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
    }
    CACHE.set(cacheKey, m)

    // Request higher-quality generation off the main thread. The sync
    // textures above provide an immediate fallback; when the worker
    // finishes we hot-swap the maps and kick a frame via the swap signal.
    // Key matches `proceduralWorkerKey` so in-flight requests coalesce.
    const workerKey = proceduralWorkerKey(def.id, def.pattern, def.swatch, size)
    void scheduleWorkerUpgrade(m, def.id, def.pattern, def.swatch, size, def.uvScale, workerKey)

    return m
  }
  if (def.kind === 'textured' && textures) {
    if (textures.albedo) m.map = textures.albedo
    if (textures.normal) m.normalMap = textures.normal
    if (textures.roughness) m.roughnessMap = textures.roughness
    if (textures.ao) m.aoMap = textures.ao
    // Apply UV repeat so the picker thumbnail and the rendered surface
    // tile at the metres-per-tile rate declared in the def.
    for (const t of [textures.albedo, textures.normal, textures.roughness, textures.ao]) {
      if (!t) continue
      t.wrapS = t.wrapT = 1000 // RepeatWrapping
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
    }
  }
  CACHE.set(cacheKey, m)
  return m
}

/** Drops the cached material for a MaterialId — used when a user
 *  material is deleted so its GPU resources are reclaimed. */
export function disposeCachedMaterial(id: string): void {
  const m = CACHE.get(id)
  if (!m) return
  m.dispose()
  if (m.map) m.map.dispose()
  if (m.normalMap) m.normalMap.dispose()
  if (m.roughnessMap) m.roughnessMap.dispose()
  if (m.aoMap) m.aoMap.dispose()
  CACHE.delete(id)
}
