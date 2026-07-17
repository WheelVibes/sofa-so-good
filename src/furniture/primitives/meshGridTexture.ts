import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { applyAnisotropy } from '../../materials/anisotropy'
import { LruCache } from '../../materials/materialLru'

/**
 * A seamless-tiling wire-grid alpha texture for safety-mesh fills (window mesh
 * screens, mesh pet gates). Transparent cells with thin opaque wires along two
 * edges so adjacent tiles complete a continuous grid — set the material's
 * `map`+`alphaMap` to this and choose `texture.repeat` for the physical wire
 * spacing. Canvas-drawn (like the `ContactShadow` blob / `decalTexture`
 * precedent), not bespoke texture art. Cached per wire colour and shared across
 * every placed fixture.
 *
 * The per-colour base cache is a bounded LRU (AUD-002 discipline, same as the
 * furniture material caches): each distinct wire colour owns a GPU texture, so
 * without a bound a session that cycles the colour picker leaks one per colour.
 * Consumers `.clone()` the base per-repeat, so an evicted base only affects
 * future cache misses (its clones already own their own GPU upload); disposal is
 * deferred one frame by `LruCache`.
 */
/** Cap on distinct-colour base textures held live (AUD-002). */
export const MESH_GRID_CACHE_MAX = 24
const cache = new LruCache<CanvasTexture>({
  max: MESH_GRID_CACHE_MAX,
  dispose: (t) => t.dispose(),
})

export function getMeshGridTexture(color: string): CanvasTexture {
  const hit = cache.get(color)
  if (hit) return hit
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  // Faint fill so the screened area reads as a taut surface at distance without
  // ever going opaque (the cells stay see-through).
  ctx.fillStyle = 'rgba(40,42,46,0.05)'
  ctx.fillRect(0, 0, size, size)
  // Two edge wires (top + left) → a continuous grid once the texture repeats.
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 1.5)
  ctx.lineTo(size, 1.5)
  ctx.moveTo(1.5, 0)
  ctx.lineTo(1.5, size)
  ctx.stroke()
  const tex = applyAnisotropy(new CanvasTexture(c))
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  cache.set(color, tex)
  return tex
}

/** Test-only: live entry count of the bounded base cache (cap invariant). */
export function __meshGridCacheSizeForTest(): number {
  return cache.size
}
export function __clearMeshGridCacheForTest(): void {
  cache.clearForTest()
}
