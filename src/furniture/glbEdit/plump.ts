/**
 * GLB Asset Designer — Stage 5 cushion "plump" vertex displacement. A small,
 * pure geometry tweak that bulges a box/capsule outward like a stuffed cushion:
 * every vertex is pushed away from the shape's mid-planes with a cosine falloff
 * toward the rim, so the top/bottom crown and the sides bow out while the corners
 * stay pinned (the seam line). Normals are recomputed so the bulge catches light.
 *
 * This is the honest browser-side realism option (plan Stage 5, ruling (b)): no
 * offline cloth-sim bake, no asset production — just a resolution-independent
 * displacement on a tessellated primitive. Pure of React/store → unit-testable.
 */

import { BoxGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { TuftGrid } from './editSpec'
import { plumpVertexDelta } from './tufting'

/**
 * Displace `geo` in place into a plumped cushion. `amount` 0…1 scales the bulge
 * (capped to a fraction of the smallest footprint so it never balloons); `size`
 * is the part's [w, h, d]. A vertex bulges most at the face centres and not at
 * all at the corners: the vertical displacement crowns the top/bottom, the
 * horizontal displacement bows the sides. An optional `tuft` grid (Stage 7c)
 * subtracts smooth gaussian dimples from the top crown at the button points.
 * Recomputes normals. No-op for `amount <= 0`. Requires a tessellated geometry
 * (see `plumpBoxGeometry`) — a plain 8-corner box has no interior vertices to
 * move. The per-vertex math is the pure `plumpVertexDelta` (`tufting.ts`), so it
 * is byte-identical to the pre-Stage-7c bulge when `tuft` is absent.
 */
export function applyPlump(
  geo: BufferGeometry,
  amount: number,
  size: [number, number, number],
  tuft?: TuftGrid,
): void {
  if (amount <= 0) return
  const pos = geo.getAttribute('position')
  const [w, h, d] = size
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const [dx, dy, dz] = plumpVertexDelta(x, y, z, w, h, d, amount, tuft)
    pos.setXYZ(i, x + dx, y + dy, z + dz)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
}

/**
 * A tessellated box ready for `applyPlump` (Stage 5). Plump only needs interior
 * vertices to displace — a segmented `BoxGeometry` provides those without forcing
 * any corner rounding — so the **bevel is respected literally**: `bevel > 0`
 * rounds the edges (`RoundedBoxGeometry`, which is also tessellated), while
 * `bevel = 0` keeps SHARP corners on a segmented box and still bulges. (Previously
 * a minimum radius was forced whenever plump was set, silently rounding a cushion
 * the user asked to keep crisp — the rounding was never a geometric requirement of
 * the displacement.) Returns a box that is already displaced.
 */
export function plumpBoxGeometry(
  w: number,
  h: number,
  d: number,
  bevel: number,
  amount: number,
  tuft?: TuftGrid,
): BufferGeometry {
  const clampedR = bevel > 0 ? Math.min(bevel, Math.min(w, h, d) / 2 - 1e-4) : 0
  const geo: BufferGeometry =
    clampedR > 0 ? new RoundedBoxGeometry(w, h, d, 5, clampedR) : new BoxGeometry(w, h, d, 8, 8, 8)
  applyPlump(geo, amount, [w, h, d], tuft)
  return geo
}
