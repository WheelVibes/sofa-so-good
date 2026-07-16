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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Displace `geo` in place into a plumped cushion. `amount` 0…1 scales the bulge
 * (capped to a fraction of the smallest footprint so it never balloons); `size`
 * is the part's [w, h, d]. A vertex bulges most at the face centres and not at
 * all at the corners: the vertical displacement crowns the top/bottom, the
 * horizontal displacement bows the sides. Recomputes normals. No-op for
 * `amount <= 0`. Requires a tessellated geometry (see `plumpBoxGeometry`) — a
 * plain 8-corner box has no interior vertices to move.
 */
export function applyPlump(
  geo: BufferGeometry,
  amount: number,
  size: [number, number, number],
): void {
  const a = clamp01(amount)
  if (a <= 0) return
  const pos = geo.getAttribute('position')
  const [w, h, d] = size
  const hx = Math.max(1e-4, w / 2)
  const hy = Math.max(1e-4, h / 2)
  const hz = Math.max(1e-4, d / 2)
  // Crown height + side bow, capped so a big `amount` stays a cushion not a ball.
  const crown = a * Math.min(w, d) * 0.28
  const bow = a * Math.min(w, d) * 0.14
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const rx = clamp01(Math.abs(x) / hx)
    const ry = clamp01(Math.abs(y) / hy)
    const rz = clamp01(Math.abs(z) / hz)
    // Cosine falloff: 1 at a plane centre, 0 at the rim (cos(π/2)=0).
    const cos = (r: number) => Math.cos((r * Math.PI) / 2)
    // Vertical crown: strongest on the top/bottom faces (|y| near hy), fading to
    // the edges by the horizontal falloff so corners stay pinned.
    const dyMag = crown * (ry * ry) * cos(rx) * cos(rz)
    // Side bow: strongest on the side faces (|x|/|z| near their half), fading up
    // toward the crowned faces.
    const dxMag = bow * (rx * rx) * cos(ry) * cos(rz)
    const dzMag = bow * (rz * rz) * cos(ry) * cos(rx)
    pos.setXYZ(i, x + Math.sign(x) * dxMag, y + Math.sign(y) * dyMag, z + Math.sign(z) * dzMag)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
}

/**
 * A tessellated box ready for `applyPlump` (Stage 5). Uses `RoundedBoxGeometry`
 * (soft edges + interior vertices to displace) when a bevel/plump is wanted, or a
 * segmented `BoxGeometry` otherwise, then applies the plump. Returns a box that is
 * already displaced. `bevel` seeds the rounded-edge radius (clamped in
 * `RoundedBoxGeometry`).
 */
export function plumpBoxGeometry(
  w: number,
  h: number,
  d: number,
  bevel: number,
  amount: number,
): BufferGeometry {
  const r = Math.max(bevel, Math.min(w, h, d) * 0.06)
  const clampedR = Math.min(r, Math.min(w, h, d) / 2 - 1e-4)
  const geo: BufferGeometry =
    clampedR > 0 ? new RoundedBoxGeometry(w, h, d, 5, clampedR) : new BoxGeometry(w, h, d, 8, 8, 8)
  applyPlump(geo, amount, [w, h, d])
  return geo
}
