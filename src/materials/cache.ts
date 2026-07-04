import {
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { applyAnisotropy } from './anisotropy'
import { LruCache } from './materialLru'
import {
  effectivePatternSize,
  generateProcedural,
  getPlasterNormal,
  getPlasterRoughness,
  getProceduralBaseSize,
} from './procedural/generators'
import { proceduralWorkerKey, requestProceduralWorker } from './procedural/runProceduralWorker'
import { notifyProceduralSwap } from './proceduralSwapSignal'
import type { MaterialDef, ProceduralPattern } from './types'

// Textures a single cached material owns EXCLUSIVELY — the per-material
// CanvasTextures baked by the procedural branch (sync fallback bake AND the
// worker-upgraded swap) — vs. textures it merely references:
//   - the shared plaster normal/roughness singletons (`getPlasterNormal`/
//     `getPlasterRoughness`) that every tinted wall reuses;
//   - `textured`-branch maps, which come from drei's `useTexture` (a
//     `useLoader` cache keyed by URL) — a `tint:<baseId>:#hex` of a DLC
//     material loads the SAME texture list as its base, so the returned
//     `Texture` *instances* are shared across every tint variant of that base.
// Disposing a shared/loader-cached texture would corrupt every other live
// material referencing it, so eviction must only free OWNED textures (mirrors
// `furnitureMaterials.ts`'s `OWNED_TEXTURES`/`own`/AUD-002 pattern).
const OWNED_TEXTURES = new WeakSet<Texture>()

/** Tag a freshly-created, exclusively-owned texture so it's safe to dispose
 *  on cache eviction. Returns the texture for inline use. */
function own<T extends Texture>(tex: T): T {
  OWNED_TEXTURES.add(tex)
  return tex
}

/** Dispose an evicted cached material plus the textures it OWNS exclusively —
 *  never the shared plaster singletons or loader-cached `textured` maps.
 *  Called one frame after eviction by the LRU (see `materialLru.ts`), so any
 *  still-mounted mesh has unmounted first. */
function disposeOwnedMaterial(m: MeshStandardMaterial): void {
  for (const tex of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) {
    if (tex && OWNED_TEXTURES.has(tex)) tex.dispose()
  }
  m.dispose()
}

// PERF-A — bounded LRU + dispose-on-evict (was an unbounded `Map`, leaking a
// material + up to 3 GPU textures per distinct finish value — every colour/
// scale scrub on a wall/floor/ceiling ratcheted VRAM toward context loss).
// This cache also backs furniture DLC (`mat:<id>`) finishes — scoped under a
// `furn:` prefix by `furnitureMaterials.ts:furnitureMaterialCacheId` — on top
// of every wall/floor/ceiling finish, so the bound mirrors the furniture
// material cache's own `MATERIAL_CACHE_MAX` (256): far above any realistic
// count of *simultaneously on-screen* distinct materials across both surfaces
// and furniture DLC finishes combined. Reads happen inline during React
// render (`getCachedMaterial`/`getBuiltMaterial` in a mesh's render path), so
// a mounted mesh keeps its material's recency fresh every frame — an evicted
// (least-recently-used) entry is almost certainly orphaned, and the LRU
// defers the actual GPU disposal one frame so any still-mounted instance has
// unmounted first (see `materialLru.ts`).
const MATERIAL_CACHE_MAX = 256
const CACHE = new LruCache<MeshStandardMaterial>({
  max: MATERIAL_CACHE_MAX,
  dispose: disposeOwnedMaterial,
})

/** Test-only: current entry count of the wall/floor/ceiling material cache. */
export function __getSurfaceMaterialCacheSizeForTest(): number {
  return CACHE.size
}

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
  // Always a fresh per-call canvas texture — exclusively owned by whichever
  // material it gets assigned to, safe to dispose on cache eviction.
  return own(tex)
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
  // Optional roughness/gloss override (CUSTOMIZE-MATERIAL-PARAMS): a composed /
  // tinted finish can carry a `~<rough>` scalar. It REPLACES the kind's default
  // scalar below (set after each branch builds its maps) — multiplying any
  // roughness map. Absent → the kind's own default applies.
  const roughOverride = typeof def.roughness === 'number' ? def.roughness : undefined
  if (def.kind === 'procedural' && def.pattern === 'plaster') {
    // Painted plaster: shared normal + flat tint (no per-material textures).
    const normal = getPlasterNormal()
    m.color.set(def.swatch)
    m.roughness = 0.92
    m.normalMap = normal
    m.normalScale.set(0.4, 0.4)
    // MAT-003 — shared roller-nap roughness-drift map (Path B, present only under
    // `pbrSurfaces`; null → legacy flat matte). It's a multiplier over the 0.92
    // base scalar, so the wall stays clearly MATTE — just no longer dead-uniform.
    const roughnessMap = getPlasterRoughness()
    if (roughnessMap) m.roughnessMap = roughnessMap
    if (roughOverride != null) m.roughness = roughOverride
    CACHE.set(cacheKey, m)
    return m
  }
  if (def.kind === 'procedural') {
    const size = effectivePatternSize(def.pattern)
    const maps = generateProcedural(def.id, def.pattern, def.swatch)
    m.color.set('#ffffff') // tint baked into albedo
    // Fresh per-material canvas textures (unique per id:pattern:swatch hash,
    // no internal sharing) — owned, so eviction frees them.
    m.map = own(maps.albedo)
    m.normalMap = own(maps.normal)
    m.roughnessMap = own(maps.roughness)
    m.metalness = maps.metalness
    for (const t of [maps.albedo, maps.normal, maps.roughness]) {
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
    }
    if (roughOverride != null) m.roughness = roughOverride
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
    // REAL-1 — also apply the same anisotropic filtering the procedural path
    // gets (`imageBitmapToTexture` above / `generators.ts`), or these DLC/
    // uploaded photo textures render blurry at grazing angles while every
    // procedural fallback stays sharp. NOT owned: these come from drei's
    // `useTexture` (URL-keyed `useLoader` cache) and may be the SAME `Texture`
    // instance a sibling `tint:<baseId>:#hex` variant of this material also
    // references — never dispose them on cache eviction.
    for (const t of [textures.albedo, textures.normal, textures.roughness, textures.ao]) {
      if (!t) continue
      t.wrapS = t.wrapT = 1000 // RepeatWrapping
      t.repeat.set(1 / def.uvScale[0], 1 / def.uvScale[1])
      applyAnisotropy(t)
    }
  }
  if (roughOverride != null) m.roughness = roughOverride
  CACHE.set(cacheKey, m)
  return m
}

/** Drops the cached material for a MaterialId — used when a user
 *  material is deleted so its GPU resources are reclaimed. Removes it from
 *  the LRU immediately (no deferred frame — the caller is explicitly deleting
 *  it, not the size-based eviction path) and disposes only the textures it
 *  owns exclusively, same contract as an LRU-evicted entry. */
export function disposeCachedMaterial(id: string): void {
  const m = CACHE.delete(id)
  if (!m) return
  disposeOwnedMaterial(m)
}
