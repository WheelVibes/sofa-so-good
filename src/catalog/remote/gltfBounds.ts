/**
 * Derive a bounding-box footprint (w/d/h in metres) from an already-parsed
 * glTF JSON object by unioning every POSITION accessor's min / max. Mirrors
 * {@link ../packs/footprint.ts:glbFootprint} (which reads GLB *bytes*), but
 * operates on the JSON the remote provider hands us in
 * {@link ./resolver.ts:bundleToFurnitureDef} — no GLB header, no Three.js /
 * GLTFLoader, so it runs in Node and jsdom and needs no render.
 *
 * Convention: glTF is +Y up. We map (x, z) → footprint (w, d) and y → h.
 *
 * Node transforms are intentionally ignored (same as `glbFootprint`): the
 * render-time bbox in `GltfModel` remains authoritative and self-corrects after
 * first render; this is only a cheap, honest *pre-render* seed so placement,
 * collision, catalog sizing, and budget don't use a 1×1×1 m guess.
 */

export interface Footprint {
  w: number
  d: number
  h: number
}

interface GltfJsonLike {
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>
    }>
  }>
  accessors?: Array<{
    min?: number[]
    max?: number[]
  }>
}

/** Smallest dimension we keep — below this an axis is treated as flat. */
const MIN_DIM = 0.05
/**
 * Plausible real-world extent for a single furniture piece, in metres. A glTF
 * authored in centimetres/millimetres (or with a stray huge mesh) lands far
 * outside this; we reject such absurd bounds rather than seed a wildly wrong
 * footprint (the render-time measurement still self-corrects later).
 */
const MAX_DIM = 12

/**
 * Returns the union POSITION bbox footprint, or `undefined` when bounds are
 * unavailable (no POSITION accessor min/max) or absurd (out of the metre
 * clamp) — callers then keep their existing fallback (the 1×1×1 placeholder).
 */
export function gltfJsonFootprint(gltfJson: unknown): Footprint | undefined {
  const json = gltfJson as GltfJsonLike
  if (!json || typeof json !== 'object') return undefined

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const posIdx = prim.attributes?.POSITION
      if (typeof posIdx !== 'number') continue
      const acc = json.accessors?.[posIdx]
      if (!acc?.min || !acc?.max) continue
      if (acc.min.length < 3 || acc.max.length < 3) continue
      if (acc.min[0] < minX) minX = acc.min[0]
      if (acc.min[1] < minY) minY = acc.min[1]
      if (acc.min[2] < minZ) minZ = acc.min[2]
      if (acc.max[0] > maxX) maxX = acc.max[0]
      if (acc.max[1] > maxY) maxY = acc.max[1]
      if (acc.max[2] > maxZ) maxZ = acc.max[2]
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return undefined

  const w = maxX - minX
  const d = maxZ - minZ
  const h = maxY - minY

  // Reject absurd scales (e.g. a cm/mm-authored asset) — the longest horizontal
  // axis is the most reliable real-world signal. Falling back to the placeholder
  // is safer than seeding a 100× footprint; render-time bounds correct it later.
  const longest = Math.max(w, d, h)
  if (longest > MAX_DIM || longest < MIN_DIM) return undefined

  return {
    w: Math.max(MIN_DIM, w),
    d: Math.max(MIN_DIM, d),
    h: Math.max(MIN_DIM, h),
  }
}
