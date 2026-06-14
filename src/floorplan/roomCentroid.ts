/**
 * A representative interior point for placing a room's label, shared by the
 * walk-mode minimap, the 2D floor-plan editor, and the printable report so they
 * agree (and don't each re-derive it). The plain bounding-box centre lands
 * *outside* an L-shaped or polygon room, so this is shape-aware:
 * - polygon → the area (shoelace) centroid,
 * - L-shape (rect + extension) → the centre of the larger rectangle (always inside),
 * - plain rectangle → its centre.
 */
import type { PlanRoom, PlanVec2 } from './types'

function polygonCentroid(poly: PlanVec2[]): [number, number] {
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i]
    const [x1, z1] = poly[(i + 1) % poly.length]
    const cross = x0 * z1 - x1 * z0
    a += cross
    cx += (x0 + x1) * cross
    cz += (z0 + z1) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-9) {
    // Degenerate (zero-area) polygon → fall back to the vertex average.
    const n = poly.length
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (6 * a), cz / (6 * a)]
}

export function roomLabelPoint(r: PlanRoom): [number, number] {
  if (r.polygon && r.polygon.length >= 3) return polygonCentroid(r.polygon)
  if (r.extension) {
    const ext = r.extension
    if (ext.width * ext.depth > r.width * r.depth) {
      return [
        r.origin[0] + ext.offset[0] + ext.width / 2,
        r.origin[1] + ext.offset[1] + ext.depth / 2,
      ]
    }
  }
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

/** Where the room's NAME label is drawn: its centroid (`roomLabelPoint`) plus the
 *  optional user `labelOffset` (Sweet Home 3D movable labels). Shared by the 2D
 *  editor + the printable report so a nudged label agrees everywhere. */
export function roomLabelPosition(r: PlanRoom): [number, number] {
  const [cx, cz] = roomLabelPoint(r)
  const off = r.labelOffset
  return off ? [cx + off[0], cz + off[1]] : [cx, cz]
}
