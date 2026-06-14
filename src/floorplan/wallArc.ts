/**
 * Curved-wall geometry (SweetHome3DJS arc-wall parity, adapted + optimized).
 *
 * A wall's optional `arc` is the signed perpendicular bulge (metres) at its
 * midpoint, measured from the straight chord between `start` and `end`. We model
 * the curve as a **true circular arc** through the two endpoints whose midpoint
 * bulges by `arc` (`arcCircle`), then sample it into short straight chord
 * sub-segments. Those feed the *existing* straight-wall pipeline (`wallBoxes`,
 * `planCollisionWalls`, room detection) unchanged, so a curved wall reuses all
 * the proven geometry/collision code. The 2D editor draws it as an SVG `A` arc.
 * Pure + unit-tested (no three/React imports).
 */
import type { PlanVec2, PlanWall } from './types'

const MIN_ARC = 1e-3 // bulges below this read as straight
const DEFAULT_SEGMENTS = 12

/** True when the wall has a meaningful curve. */
export function isCurvedWall(w: Pick<PlanWall, 'arc'>): boolean {
  return typeof w.arc === 'number' && Math.abs(w.arc) > MIN_ARC
}

/** Unit left-normal of the chord (perpendicular, +90° from start→end in XZ). */
function leftNormal(start: PlanVec2, end: PlanVec2): PlanVec2 {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const len = Math.hypot(dx, dz) || 1
  return [-dz / len, dx / len]
}

/**
 * The true circular arc through `start` and `end` whose midpoint bulges by `arc`
 * (signed, along the chord's left-normal). Returns the circle centre `o`, radius
 * `r`, the start angle `phi0` and signed sweep `delta` (so `phi0 + delta` reaches
 * `end`, passing through the bulge apex), or null for a straight wall.
 *
 * Geometry: with chord length L and sagitta h, R = (L²/4 + h²) / (2|h|); the
 * centre sits on the perpendicular bisector on the side opposite the bulge. The
 * sweep direction is chosen so the arc's midpoint lands on the bulge side (this
 * picks the minor vs major arc correctly for |h| ≷ L/2).
 */
function arcCircle(w: PlanWall): { o: PlanVec2; r: number; phi0: number; delta: number } | null {
  if (!isCurvedWall(w)) return null
  const [sx, sz] = w.start
  const [ex, ez] = w.end
  const dx = ex - sx
  const dz = ez - sz
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return null
  const h = w.arc ?? 0
  const n = leftNormal(w.start, w.end)
  const mx = (sx + ex) / 2
  const mz = (sz + ez) / 2
  const r = (len * len) / 4 / (2 * Math.abs(h)) + Math.abs(h) / 2
  // Centre on the perpendicular bisector, opposite the bulge side.
  const off = (r - Math.abs(h)) * Math.sign(h)
  const o: PlanVec2 = [mx - n[0] * off, mz - n[1] * off]
  const phi0 = Math.atan2(sz - o[1], sx - o[0])
  const phiE = Math.atan2(ez - o[1], ex - o[0])
  let delta = phiE - phi0
  while (delta <= -Math.PI) delta += 2 * Math.PI
  while (delta > Math.PI) delta -= 2 * Math.PI
  // Pick minor/major arc: the sampled midpoint must sit on the bulge side.
  const phiMid = phi0 + delta / 2
  const midSide =
    (o[0] + r * Math.cos(phiMid) - mx) * n[0] + (o[1] + r * Math.sin(phiMid) - mz) * n[1]
  if (Math.sign(midSide) !== Math.sign(h)) delta -= Math.sign(delta) * 2 * Math.PI
  return { o, r, phi0, delta }
}

/** Sample the wall's curve into `segments + 1` ordered points (start → end).
 *  A straight wall returns just its two endpoints. A curved wall is a true
 *  circular arc (SweetHome3DJS parity). */
export function wallArcPoints(w: PlanWall, segments = DEFAULT_SEGMENTS): PlanVec2[] {
  const c = arcCircle(w)
  if (!c) return [w.start, w.end]
  const n = Math.max(2, Math.round(segments))
  const pts: PlanVec2[] = []
  for (let i = 0; i <= n; i++) {
    // Anchor the exact endpoints (avoid float drift at i=0 / i=n).
    if (i === 0) {
      pts.push(w.start)
      continue
    }
    if (i === n) {
      pts.push(w.end)
      continue
    }
    const phi = c.phi0 + c.delta * (i / n)
    pts.push([c.o[0] + c.r * Math.cos(phi), c.o[1] + c.r * Math.sin(phi)])
  }
  return pts
}

/** Decompose a (possibly curved) wall into straight chord sub-walls that share
 *  the wall's thickness/topHeight. Straight walls return themselves unchanged.
 *  Sub-walls carry no openings (curved walls don't host openings in v1). */
export function wallChords(w: PlanWall, segments = DEFAULT_SEGMENTS): PlanWall[] {
  if (!isCurvedWall(w)) return [w]
  const pts = wallArcPoints(w, segments)
  const chords: PlanWall[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    chords.push({
      id: `${w.id}::arc${i}`,
      start: pts[i],
      end: pts[i + 1],
      thickness: w.thickness,
      ...(w.topHeight !== undefined ? { topHeight: w.topHeight } : {}),
    })
  }
  return chords
}

/** SVG path `d` for a curved wall (a true `A` arc), or a straight line. */
export function wallSvgPath(w: PlanWall, toPx: (m: number) => number): string {
  const s = `${toPx(w.start[0])},${toPx(w.start[1])}`
  const e = `${toPx(w.end[0])},${toPx(w.end[1])}`
  const c = arcCircle(w)
  if (!c) return `M ${s} L ${e}`
  const rPx = toPx(c.r) - toPx(0) // world radius → screen px (toPx is affine)
  const largeArc = Math.abs(c.delta) > Math.PI ? 1 : 0
  // toPx preserves orientation (z maps to screen-y, downward), so a positive
  // (increasing-angle) sweep reads as SVG sweep-flag 1.
  const sweep = c.delta > 0 ? 1 : 0
  return `M ${s} A ${rPx} ${rPx} 0 ${largeArc} ${sweep} ${e}`
}

/** The world point on the wall's curve at its midpoint — where the bulge drag
 *  handle sits. For a straight wall this is the chord midpoint. */
export function wallCurveMidpoint(w: PlanWall): PlanVec2 {
  const mx = (w.start[0] + w.end[0]) / 2
  const mz = (w.start[1] + w.end[1]) / 2
  if (!isCurvedWall(w)) return [mx, mz]
  const n = leftNormal(w.start, w.end)
  return [mx + n[0] * (w.arc ?? 0), mz + n[1] * (w.arc ?? 0)]
}

/** Total length along the curve (sum of chord-segment lengths). For a straight
 *  wall this equals the chord length. */
export function wallArcLength(w: PlanWall, segments = DEFAULT_SEGMENTS): number {
  const pts = wallArcPoints(w, segments)
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  return total
}

/** Point + tangent heading at arc-length `s` along the (possibly curved) wall.
 *  `angle` matches the wall-box convention `atan2(dx, dz)`. Clamps to [0, len]. */
export function pointAtArcLength(
  w: PlanWall,
  s: number,
  segments = DEFAULT_SEGMENTS,
): { x: number; z: number; angle: number } {
  const pts = wallArcPoints(w, segments)
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const segLen = Math.hypot(bx - ax, bz - az) || 1e-6
    if (s <= acc + segLen || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (s - acc) / segLen))
      const dx = (bx - ax) / segLen
      const dz = (bz - az) / segLen
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle: Math.atan2(dx, dz) }
    }
    acc += segLen
  }
  const [x, z] = pts[0]
  return { x, z, angle: 0 }
}

/** Nearest point on the (possibly curved) wall to a world point: its arc-length
 *  offset + perpendicular distance. Walks the chord polyline. For placing an
 *  opening on a curve (offset is arc-length) + hit-testing the bulged span. */
export function nearestArcLength(
  w: PlanWall,
  point: PlanVec2,
  segments = DEFAULT_SEGMENTS,
): { offset: number; dist: number } {
  const pts = wallArcPoints(w, segments)
  let acc = 0
  let best = { offset: 0, dist: Infinity }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const segLen2 = dx * dx + dz * dz || 1e-9
    const t = Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - az) * dz) / segLen2))
    const px = ax + dx * t
    const pz = az + dz * t
    const dist = Math.hypot(point[0] - px, point[1] - pz)
    if (dist < best.dist) best = { offset: acc + Math.sqrt(segLen2) * t, dist }
    acc += Math.sqrt(segLen2)
  }
  return best
}

/** Signed bulge (for the drag handle) given a dragged midpoint world point:
 *  the component of (point − chordMid) along the chord's left-normal. */
export function arcFromMidpoint(start: PlanVec2, end: PlanVec2, point: PlanVec2): number {
  const mx = (start[0] + end[0]) / 2
  const mz = (start[1] + end[1]) / 2
  const n = leftNormal(start, end)
  return (point[0] - mx) * n[0] + (point[1] - mz) * n[1]
}
