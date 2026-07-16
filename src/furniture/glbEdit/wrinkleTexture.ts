/**
 * GLB Asset Designer — Stage 6e procedural fabric wrinkle normal map for
 * plumped cushions. A plumped box/capsule (Stage 5) bulges like a stuffed
 * cushion but its *surface* still reads as a flat plastic shell; this adds the
 * micro-detail that makes it read as sewn upholstery: soft low-frequency
 * wrinkles that gather toward the pinned corners/seams (where a real cushion
 * creases) plus a fine fabric nap over the whole face.
 *
 * The height field is pure + deterministic given a seed (`buildWrinkleHeight`),
 * so it is unit-testable in node without any GPU or 2D-canvas context — the same
 * discipline as `materials/procedural/upholsterySeams.ts` (the RZ6 upholstery
 * height) and the stone/plaster micro-detail helpers. The normal map itself is a
 * `DataTexture` baked straight from the RGBA buffer — no 2D canvas is needed to
 * GENERATE it (unlike the `canvasFrom` precedent), so the map exists even in a
 * headless test and the spec→material wiring is fully testable; the browser's
 * `GLTFExporter` still embeds it as a PNG on export (verified — the normal
 * texture + `normalScale` survive the round-trip).
 *
 * No bespoke texture art: value-noise fbm only, seeded from the part id so a
 * cushion's wrinkles are stable across renders and across save/reload.
 *
 * Cache discipline (mirrors `materials/finishTextureVariant.ts`, AUD-002): baked
 * maps go through a bounded dispose-on-evict LRU keyed by a coarse
 * (seed, intensity) bucket, so dragging the Wrinkles/Plump slider reuses a
 * handful of textures instead of minting a GPU texture per frame.
 */

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
} from 'three'
import { applyAnisotropy } from '../../materials/anisotropy'
import { LruCache } from '../../materials/materialLru'
import { clamp01, hashSeed, heightToNormalRGBA, makeFbm } from '../../materials/procedural/noise'

/** Texture resolution — a small tile per the plan (256px), one tile per cushion
 *  face (box/capsule UVs are 0..1 per face), so the low-frequency wrinkles span
 *  the face and the nap resolves to ~a couple mm on a ~0.5 m cushion. */
const SIZE = 256

/** Baked bump strength handed to `heightToNormalRGBA`. Kept fixed here; the
 *  per-part visible intensity is the material's `normalScale`
 *  (`wrinkleNormalScale`), so the same baked tile serves every plump depth. */
const BAKE_STRENGTH = 2.8

/**
 * The wrinkle height field (row-major, length `size*size`, values ~0..1). Pure +
 * deterministic given `(seed, intensity)`.
 *
 * Channels:
 *  - **fabric nap** — a fine fbm grain over the whole face so the cloth has a
 *    tactile weave rather than a dead-flat sheet.
 *  - **gathered wrinkles** — broad, low-frequency fbm creases whose amplitude is
 *    masked by `cornerness` (peaks at the four tile corners, zero at the crowned
 *    centre), so the folds gather toward the pinned seam corners like a stuffed
 *    cushion and leave the bulged middle smooth. `intensity` (0..1) scales the
 *    crease depth so a stronger Wrinkles setting reads as a more gathered cushion
 *    (the nap is intensity-independent — cloth always has grain).
 *
 * `cornerness` is edge-symmetric (`1 - 4t(1-t)` is 1 at t∈{0,1}, 0 at t=0.5), so
 * it is C0-continuous across the tile boundary and the map still tiles.
 */
export function buildWrinkleHeight(size: number, seed: number, intensity: number): Float32Array {
  const amt = clamp01(intensity)
  // Fine cloth nap (fbm, high freq) + broad gathered folds (fbm, low freq).
  const nap = makeFbm(seed ^ 0x7a11, 3, 56)
  const fold = makeFbm(seed ^ 0x30d5, 3, 3)
  const fold2 = makeFbm(seed ^ 0x5c2b, 2, 5)
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // Gather mask: high at the seam corners, ~0 at the crowned centre.
      const eu = 1 - 4 * u * (1 - u)
      const ev = 1 - 4 * v * (1 - v)
      const cornerness = clamp01((eu + ev) * 0.5)
      // Broad signed creases (centred fbm), concentrated by the gather mask so
      // they read as fabric pulling toward the pinned corners, not uniform noise.
      const crease = (fold(u, v) - 0.5) * 2 + (fold2(u, v) - 0.5) * 0.9
      const gathered = crease * (0.25 + 0.75 * cornerness) * (0.35 + 0.65 * amt)
      // Fine nap over the whole face (intensity-independent cloth grain).
      const grain = (nap(u, v) - 0.5) * 0.35
      out[y * size + x] = clamp01(0.5 + gathered * 0.32 + grain)
    }
  }
  return out
}

/** Bounded above any realistic count of simultaneously-rendered plumped parts ×
 *  distinct (seed, intensity-bucket) tiles. Evicted maps dispose one frame later
 *  (LRU mount-safety), like the sibling `finishTextureVariant` cache. */
const wrinkleCache = new LruCache<DataTexture>({ max: 48, dispose: (t) => t.dispose() })

/** Coarse intensity bucket (0.1 steps) so a Wrinkles/Plump slider drag reuses a
 *  handful of tiles instead of baking one per frame. Exported for the bound test. */
export function wrinkleIntensityBucket(intensity: number): number {
  return Math.round(clamp01(intensity) * 10) / 10
}

/** Cache key for a baked wrinkle map. Seed is the (already hashed) numeric seed;
 *  intensity is coarsely bucketed. Exported for the bound test. */
export function wrinkleTextureKey(seed: number, intensity: number): string {
  return `${seed >>> 0}:${wrinkleIntensityBucket(intensity)}`
}

/**
 * A cached, bounded, seeded fabric-wrinkle normal map (`DataTexture`) for a
 * plumped part. `seedStr` is the part id (hashed to a stable numeric seed so the
 * wrinkles are identical every render + across save/reload); `intensity` is the
 * Wrinkles setting (0..1). The caller must NOT dispose the returned texture (the
 * cache owns it). Returns a linear-space, repeat-wrapped, anisotropic map ready
 * to assign to `material.normalMap`.
 */
export function wrinkleNormalTexture(seedStr: string, intensity: number): DataTexture {
  const seed = hashSeed(seedStr)
  const key = wrinkleTextureKey(seed, intensity)
  const hit = wrinkleCache.get(key)
  if (hit) return hit
  const height = buildWrinkleHeight(SIZE, seed, intensity)
  const rgba = heightToNormalRGBA(height, SIZE, BAKE_STRENGTH)
  const tex = new DataTexture(new Uint8Array(rgba.buffer), SIZE, SIZE, RGBAFormat)
  // Normal maps are LINEAR data (DataTexture defaults to NoColorSpace — correct).
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  applyAnisotropy(tex)
  tex.needsUpdate = true
  wrinkleCache.set(key, tex)
  return tex
}

/**
 * Visible bump strength (`normalScale`) for a plumped + wrinkled part. Follows
 * the plump depth — a deeper cushion earns stronger creases — scaled by the
 * Wrinkles intensity (so the slider dials it down / off). Range ≈ 0.15…0.4 at
 * full intensity as plump goes 0→1 (the plan's "0.15–0.4·plump"). Pure. */
export function wrinkleNormalScale(plump: number, intensity: number): number {
  return clamp01(intensity) * (0.15 + 0.25 * clamp01(plump))
}

/** The effective Wrinkles intensity for a part: an explicit `wrinkles` field
 *  wins (including an explicit 0 = OFF); an ABSENT field defaults ON at a subtle
 *  level when the part is plumped (the realism default the research asked for),
 *  and OFF when it isn't. Pure — the single resolve used by both the render
 *  build and the inspector's displayed default. */
export const DEFAULT_WRINKLES = 0.6
export function effectiveWrinkles(plump: number | undefined, wrinkles: number | undefined): number {
  if ((plump ?? 0) <= 0) return 0
  return clamp01(wrinkles ?? DEFAULT_WRINKLES)
}

/** Test-only: current live baked-tile count (bound assertion). */
export function __wrinkleCacheSizeForTest(): number {
  return wrinkleCache.size
}

/** Test-only: drop all cached tiles. */
export function __clearWrinkleCacheForTest(): void {
  wrinkleCache.clearForTest()
}
