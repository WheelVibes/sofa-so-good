/**
 * Corner fillet / bevel geometry — round or chamfer a wall corner where two
 * plan walls meet at a shared vertex.
 *
 * Given two rays from a shared `corner` vertex toward neighbour points `a` and
 * `b`, `cornerFilletArc` computes the circular arc of a given radius tangent to
 * both wall segments (a rounded corner). The tangent point on each ray sits at
 * distance `r / tan(theta/2)` from the corner (theta = interior angle between
 * the rays); the arc centre lies along the angle bisector at distance
 * `r / sin(theta/2)`. `cornerBevelPoints` gives the straight-chamfer setback
 * points instead, and `filletArcToPolyline` samples the arc into short chords
 * (same approach as wallArc.ts) for rendering/collision reuse.
 *
 * Pure + unit-tested (no three/React imports).
 */
import type { PlanVec2 } from './types'

const EPS = 1e-9
const DEFAULT_SEGMENTS = 8

/** Unit vector from `from` toward `to`, or null if the points coincide. */
function unit(from: PlanVec2, to: PlanVec2): { ux: number; uz: number; len: number } | null {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  if (len < EPS) return null
  return { ux: dx / len, uz: dz / len, len }
}

/**
 * Circular fillet (rounded corner) of `radius` tangent to both rays
 * `corner→a` and `corner→b`. Returns the tangent points (`start` on the
 * corner→a segment, `end` on the corner→b segment), the arc `center`, the
 * `startAngle`/`endAngle` (atan2 from centre to each tangent point) and the
 * signed `sweep` between them.
 *
 * Returns `null` when the corner is degenerate: a zero-length ray, collinear
 * rays (theta ≈ 0 or π), radius ≤ 0, or a radius too large to fit (the tangent
 * point would fall beyond the shorter of the two segments).
 */
export function cornerFilletArc(
  a: PlanVec2,
  corner: PlanVec2,
  b: PlanVec2,
  radius: number,
): {
  center: PlanVec2
  start: PlanVec2
  end: PlanVec2
  startAngle: number
  endAngle: number
  sweep: number
} | null {
  if (!(radius > 0)) return null
  const ra = unit(corner, a)
  const rb = unit(corner, b)
  if (!ra || !rb) return null

  // Interior angle between the two rays (0..π).
  const dot = Math.max(-1, Math.min(1, ra.ux * rb.ux + ra.uz * rb.uz))
  const theta = Math.acos(dot)
  // Collinear (parallel or anti-parallel) → no well-defined corner.
  if (theta < EPS || Math.PI - theta < EPS) return null

  const half = theta / 2
  const tanHalf = Math.tan(half)
  const sinHalf = Math.sin(half)
  if (Math.abs(tanHalf) < EPS || Math.abs(sinHalf) < EPS) return null

  // Tangent distance from the corner along each ray, and centre distance along
  // the bisector.
  const tangentDist = radius / tanHalf
  const centerDist = radius / sinHalf
  // Too large to fit on the shorter segment.
  if (tangentDist > ra.len + EPS || tangentDist > rb.len + EPS) return null

  const start: PlanVec2 = [corner[0] + ra.ux * tangentDist, corner[1] + ra.uz * tangentDist]
  const end: PlanVec2 = [corner[0] + rb.ux * tangentDist, corner[1] + rb.uz * tangentDist]

  // Angle bisector unit direction (rays already unit; their sum bisects).
  const bx = ra.ux + rb.ux
  const bz = ra.uz + rb.uz
  const blen = Math.hypot(bx, bz)
  if (blen < EPS) return null // anti-parallel guard (also caught by theta≈π)
  const center: PlanVec2 = [
    corner[0] + (bx / blen) * centerDist,
    corner[1] + (bz / blen) * centerDist,
  ]

  const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0])
  const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0])
  // Shortest signed sweep from start to end (the minor arc rounds the corner).
  let sweep = endAngle - startAngle
  while (sweep <= -Math.PI) sweep += 2 * Math.PI
  while (sweep > Math.PI) sweep -= 2 * Math.PI

  return { center, start, end, startAngle, endAngle, sweep }
}

/**
 * Straight chamfer (bevel): the two points set back `setback` metres from the
 * corner along each ray. Returns `null` on a degenerate corner (zero-length
 * ray, setback ≤ 0, or a setback longer than either segment).
 */
export function cornerBevelPoints(
  a: PlanVec2,
  corner: PlanVec2,
  b: PlanVec2,
  setback: number,
): { start: PlanVec2; end: PlanVec2 } | null {
  if (!(setback > 0)) return null
  const ra = unit(corner, a)
  const rb = unit(corner, b)
  if (!ra || !rb) return null
  if (setback > ra.len + EPS || setback > rb.len + EPS) return null
  return {
    start: [corner[0] + ra.ux * setback, corner[1] + ra.uz * setback],
    end: [corner[0] + rb.ux * setback, corner[1] + rb.uz * setback],
  }
}

/**
 * Sample a fillet arc into `segments + 1` ordered points (start → end),
 * anchoring the exact tangent points at the ends (avoid float drift), the same
 * sampling approach as `wallArc.ts:wallArcPoints`.
 */
export function filletArcToPolyline(
  fillet: NonNullable<ReturnType<typeof cornerFilletArc>>,
  segments = DEFAULT_SEGMENTS,
): PlanVec2[] {
  const n = Math.max(1, Math.round(segments))
  const { center, start, end, startAngle, sweep } = fillet
  const [cx, cz] = center
  const r = Math.hypot(start[0] - cx, start[1] - cz)
  const pts: PlanVec2[] = []
  for (let i = 0; i <= n; i++) {
    if (i === 0) {
      pts.push(start)
      continue
    }
    if (i === n) {
      pts.push(end)
      continue
    }
    const phi = startAngle + sweep * (i / n)
    pts.push([cx + r * Math.cos(phi), cz + r * Math.sin(phi)])
  }
  return pts
}
