/**
 * Scaled / grain-rotated texture variants for GLB-designer part finishes
 * (Asset Studio Stage 6c). A part carrying a `mat:<id>` finish can override the
 * texture tile size (`finishScale`) and grain direction (`finishRotation`); the
 * finish-material clone in `glbEdit/buildObject.ts` swaps each texture channel
 * for a variant built here.
 *
 * The shared finish materials in `furnitureMaterials.ts` OWN their textures and
 * are cached across the whole app — so this module must NEVER mutate a passed-in
 * source texture's `repeat`/`rotation` (that would corrupt every other surface
 * using the same finish). It clones the texture instead and applies the
 * transform on the clone.
 *
 * A fresh clone per slider frame would leak a GPU texture on every drag, so
 * variants go through a bounded LRU keyed by `(source uuid, scale, rotation)` —
 * the same bounded + dispose-on-evict discipline as `furnitureMaterials`'
 * `furnitureRepeatCache` (AUD-002). A drag reuses the ~handful of distinct
 * (scale, rotation) variants instead of ratcheting VRAM.
 *
 * Pure of React/spec types → unit-testable (`finishTextureVariant.test.ts`).
 */

import type { Texture } from 'three'
import { applyAnisotropy } from './anisotropy'
import { LruCache } from './materialLru'

/** Bounded above any realistic count of simultaneously-rendered textured parts ×
 *  channels × distinct (scale, rotation) variants. Evicted clones dispose one
 *  frame later (LRU mount-safety), like the sibling furniture caches. */
const variantCache = new LruCache<Texture>({ max: 96, dispose: (t) => t.dispose() })

/** The cache key for a scaled/rotated variant of `base`. Exported for the bound
 *  test (asserting a slider sweep reuses a small key set). */
export function finishVariantKey(base: Texture, scale: number, rotationDeg: number): string {
  return `${base.uuid}:s${scale.toFixed(3)}:r${rotationDeg.toFixed(1)}`
}

/**
 * A cloned variant of `base` whose tile size is multiplied by `scale` (repeat
 * divided — larger scale = coarser tiling, matching the `compose:@<scale>`
 * convention) and whose UVs are rotated by `rotationDeg` about the tile centre.
 * The source texture is never mutated. Cached + bounded per
 * `(uuid, scale, rotation)`; caller must NOT dispose the returned texture (the
 * cache owns it). At scale 1 + rotation 0 the caller should skip this (the base
 * texture is already correct) — `buildObject` gates on that.
 */
export function finishTextureVariant(base: Texture, scale: number, rotationDeg: number): Texture {
  const key = finishVariantKey(base, scale, rotationDeg)
  const hit = variantCache.get(key)
  if (hit) return hit
  const t = base.clone()
  t.needsUpdate = true
  const inv = scale > 0 ? 1 / scale : 1
  t.repeat.set(base.repeat.x * inv, base.repeat.y * inv)
  if (rotationDeg !== 0) {
    t.center.set(0.5, 0.5)
    t.rotation = (rotationDeg * Math.PI) / 180
  }
  applyAnisotropy(t)
  variantCache.set(key, t)
  return t
}

/** Test-only: current live variant count (bound assertion). */
export function __finishVariantCacheSizeForTest(): number {
  return variantCache.size
}

/** Test-only: drop all cached variants. */
export function __clearFinishVariantCacheForTest(): void {
  variantCache.clearForTest()
}
