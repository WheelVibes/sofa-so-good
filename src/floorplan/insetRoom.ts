/**
 * Pure polygon inset / outset (PARITY-ROOM-INSET).
 *
 * `insetPolygon(points, dist)` offsets every edge of a simple polygon by a signed
 * distance and re-intersects adjacent offset edges to find the new vertices:
 *   - `dist > 0` shrinks the polygon inward (a dropped soffit / set-down),
 *   - `dist < 0` grows it outward (a setback / fattened footprint),
 *   - `dist === 0` is an identity (returns a fresh copy).
 *
 * Handles convex AND simple concave (L-shaped) rooms. The offset is uniform: each
 * edge moves by `dist` along its own inward normal, so the result is a true
 * mitred offset (sharp corners are kept as line–line intersections, not arced) —
 * matching the Coohom / CAD "offset polygon" tool.
 *
 * Degenerate result → `null`. A polygon collapses when the inset distance exceeds
 * (roughly) half its narrowest waist: offsetting then over-runs and the result
 * either folds on itself (self-intersects) or loses all area. Rather than emit a
 * broken self-intersecting polygon we DETECT collapse and return `null` so the
 * caller can reject the operation (the store action turns this into a toast).
 * Detection is conservative — the result must keep the SAME winding sign as the
 * input and a non-trivial area; either failing means the offset over-ran.
 *
 * Pure (no three / React) — unit-tested in isolation. Reuses `polygonArea`
 * (shoelace) from `./types`.
 */
import { type PlanVec2, polygonArea } from './types'

/** Signed shoelace area — only its SIGN is used (for winding), never its
 *  magnitude (that's `polygonArea`, which returns the absolute value). */
function signedArea(pts: readonly PlanVec2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]!
    const [x2, z2] = pts[(i + 1) % pts.length]!
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

/** Drop consecutive duplicate vertices (within `eps`) and a duplicated closing
 *  vertex, so edge math never divides by a zero-length edge. */
function dedupe(pts: readonly PlanVec2[], eps = 1e-7): PlanVec2[] {
  const out: PlanVec2[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push([p[0], p[1]])
  }
  // Closing duplicate (first === last).
  if (out.length >= 2) {
    const first = out[0]!
    const last = out[out.length - 1]!
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= eps) out.pop()
  }
  return out
}

/** Intersect two infinite lines, each given as a point + direction. Returns the
 *  intersection point, or `null` when the directions are (near-)parallel. */
function lineIntersect(p1: PlanVec2, d1: PlanVec2, p2: PlanVec2, d2: PlanVec2): PlanVec2 | null {
  const denom = d1[0] * d2[1] - d1[1] * d2[0]
  if (Math.abs(denom) < 1e-9) return null
  const dx = p2[0] - p1[0]
  const dz = p2[1] - p1[1]
  const t = (dx * d2[1] - dz * d2[0]) / denom
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t]
}

/**
 * Inset (dist>0) / outset (dist<0) a simple polygon by a signed distance.
 *
 * @param points  Polygon vertices in order (CW or CCW), absolute metres. Needs
 *                ≥ 3 distinct vertices; otherwise returns `null`.
 * @param dist    Signed offset in metres. Positive shrinks inward, negative grows.
 * @returns The offset polygon (one vertex per de-duplicated input vertex, same
 *          winding) or `null` when the operation collapses / is invalid.
 */
export function insetPolygon(points: readonly PlanVec2[], dist: number): PlanVec2[] | null {
  if (!Number.isFinite(dist)) return null
  const poly = dedupe(points)
  const n = poly.length
  if (n < 3) return null

  // A zero offset is an identity (return a fresh copy so the caller can mutate).
  if (Math.abs(dist) < 1e-9) return poly.map((p) => [p[0], p[1]] as PlanVec2)

  const area0 = signedArea(poly)
  if (Math.abs(area0) < 1e-9) return null // degenerate (zero-area) input
  // Winding sign drives which way "inward" points. We fold it into the offset
  // sign so the same normal formula serves both CW and CCW polygons.
  const wind = area0 > 0 ? 1 : -1
  const off = dist * wind

  // For each edge: a point on it (its start) + its unit direction + that edge's
  // line shifted inward by `off` (a point that line passes through).
  type Edge = { dir: PlanVec2; movedP: PlanVec2 }
  const edges: Edge[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % n]!
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    const len = Math.hypot(ex, ez)
    if (len < 1e-9) return null
    const dir: PlanVec2 = [ex / len, ez / len]
    // The normal `(-dir.z, dir.x)` points toward the interior for a polygon with
    // positive shoelace area; we fold the winding into `off` (negative shoelace
    // area → `off` flips) so the same formula serves both windings. Shifting the
    // edge inward by `off` moves a point on it by `+normal * off`.
    const nx = -dir[1]
    const nz = dir[0]
    const movedP: PlanVec2 = [a[0] + nx * off, a[1] + nz * off]
    edges.push({ dir, movedP })
  }

  // Each new vertex = intersection of the offset lines of the two edges meeting
  // at that original vertex (edge i-1 and edge i).
  const result: PlanVec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = edges[(i - 1 + n) % n]!
    const cur = edges[i]!
    const x = lineIntersect(prev.movedP, prev.dir, cur.movedP, cur.dir)
    if (!x) {
      // Parallel adjacent edges (collinear vertex) — the moved point on the
      // shared edge IS the offset vertex.
      result.push([cur.movedP[0], cur.movedP[1]])
      continue
    }
    if (!Number.isFinite(x[0]) || !Number.isFinite(x[1])) return null
    result.push(x)
  }

  // Collapse detection 1: every result edge must still run in the SAME direction
  // as its source edge. When the inset over-runs, an edge reverses (the polygon
  // folds inside-out — e.g. a square inset past half-width becomes an inverted
  // square whose shoelace sign is unchanged), which this catches where a winding
  // check cannot. A near-zero edge (dot ≈ 0) means it shrank to a point.
  for (let i = 0; i < n; i++) {
    const a = result[i]!
    const b = result[(i + 1) % n]!
    const src = edges[i]!.dir
    const dot = (b[0] - a[0]) * src[0] + (b[1] - a[1]) * src[1]
    if (dot <= 1e-9) return null
  }

  // Collapse detection 2: the offset must keep the SAME winding sign and a
  // non-trivial area (a belt-and-braces guard against a degenerate sliver).
  const areaR = signedArea(result)
  if (Math.sign(areaR) !== Math.sign(area0)) return null
  if (polygonArea(result) < 1e-6) return null

  return result
}
