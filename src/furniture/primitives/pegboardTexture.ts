import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { applyAnisotropy } from '../../materials/anisotropy'
import { LruCache } from '../../materials/materialLru'

/**
 * A seamless-tiling perforated-board (pegboard) colour texture: one hole cell —
 * a board-coloured square with a small recessed dark hole centred in it — that
 * tiles into a full peg-hole grid when the material's `map.repeat` is set to the
 * number of holes across × down. Canvas-drawn (the `meshGridTexture` /
 * `ContactShadow` precedent), not bespoke texture art, so a real hole grid reads
 * at every tier with near-zero geometry cost (no per-hole mesh).
 *
 * Cached per board colour as a bounded LRU (AUD-002 discipline, same as the mesh
 * grid + furniture material caches): each distinct colour owns one GPU texture,
 * so cycling the colour picker can't leak. Consumers `.clone()` the base per
 * repeat, so an evicted base only affects future cache misses (its clones already
 * own their GPU upload); disposal is deferred one frame by `LruCache`.
 */
/** Cap on distinct-colour base textures held live (AUD-002). */
export const PEGBOARD_CACHE_MAX = 24
const cache = new LruCache<CanvasTexture>({
  max: PEGBOARD_CACHE_MAX,
  dispose: (t) => t.dispose(),
})

export function getPegboardTexture(color: string): CanvasTexture {
  const hit = cache.get(color)
  if (hit) return hit
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  // Board face fills the whole cell.
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  // Recessed hole in the centre — a dark disc with a faint lighter rim so it
  // reads as a drilled hole, not a printed dot.
  const cx = size / 2
  const r = size * 0.16
  ctx.fillStyle = 'rgba(30,28,25,0.85)'
  ctx.beginPath()
  ctx.arc(cx, cx, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cx, r + 1, 0, Math.PI * 2)
  ctx.stroke()
  const tex = applyAnisotropy(new CanvasTexture(c))
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  cache.set(color, tex)
  return tex
}

/** Test-only: live entry count of the bounded base cache (cap invariant). */
export function __pegboardCacheSizeForTest(): number {
  return cache.size
}
export function __clearPegboardCacheForTest(): void {
  cache.clearForTest()
}
