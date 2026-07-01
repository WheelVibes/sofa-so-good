/**
 * Oriented bounding box on the floor plane (XZ). Pure math — no React,
 * no three.js. Used by placement collision to test furniture against
 * walls (segments) and other furniture (OBBs).
 */

export interface OBB {
  cx: number
  cz: number
  /** Half-width along the OBB's local X axis. */
  hx: number
  /** Half-depth along the OBB's local Z axis. */
  hz: number
  /** Y-axis rotation in radians. */
  rot: number
}

export interface Segment {
  ax: number
  az: number
  bx: number
  bz: number
}

/** Returns the 4 corner points of an OBB in world space, CCW. */
export function obbCorners(o: OBB): [number, number][] {
  const c = Math.cos(o.rot)
  const s = Math.sin(o.rot)
  // Local corners in CCW order: (-hx,-hz)(+hx,-hz)(+hx,+hz)(-hx,+hz)
  const local: [number, number][] = [
    [-o.hx, -o.hz],
    [o.hx, -o.hz],
    [o.hx, o.hz],
    [-o.hx, o.hz],
  ]
  return local.map(([lx, lz]) => [o.cx + lx * c - lz * s, o.cz + lx * s + lz * c])
}

/** Project a set of points onto a 2D axis. Returns [min, max]. */
function project(points: [number, number][], ax: number, az: number): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of points) {
    const t = x * ax + z * az
    if (t < min) min = t
    if (t > max) max = t
  }
  return [min, max]
}

/** Strict 1-D interval overlap with a small FP tolerance: edges
 *  touching at a single value (a[1] ≈ b[0]) does NOT count as overlap,
 *  even when arithmetic like `1.2 - 1.0 = 0.19999…` would otherwise
 *  flag flush placements as collisions. The tolerance is well below a
 *  millimetre so it never lets visible penetration slip past. */
const OVERLAP_EPSILON = 1e-6
function overlap(a: [number, number], b: [number, number]): boolean {
  return a[0] + OVERLAP_EPSILON < b[1] && b[0] + OVERLAP_EPSILON < a[1]
}

/** Returns true iff the two OBBs overlap (SAT, 4 axes). */
export function obbVsObb(a: OBB, b: OBB): boolean {
  const ca = Math.cos(a.rot)
  const sa = Math.sin(a.rot)
  const cb = Math.cos(b.rot)
  const sb = Math.sin(b.rot)
  const axes: [number, number][] = [
    [ca, sa],
    [-sa, ca],
    [cb, sb],
    [-sb, cb],
  ]
  const cornersA = obbCorners(a)
  const cornersB = obbCorners(b)
  for (const [ax, az] of axes) {
    if (!overlap(project(cornersA, ax, az), project(cornersB, ax, az))) {
      return false
    }
  }
  return true
}

/** Minimum translation vector to push OBB `a` out of OBB `b` (SAT). Returns the
 *  unit separation axis (`nx,nz`, oriented to move `a` away from `b`) + the
 *  penetration `depth` along it, or `null` when they don't overlap. Drives the
 *  soft push-apart nudge (a design tool wants a gentle slide off an obstacle, not
 *  a hard block). Pure — same 4 SAT axes as {@link obbVsObb}. */
export function obbMtv(a: OBB, b: OBB): { nx: number; nz: number; depth: number } | null {
  const ca = Math.cos(a.rot)
  const sa = Math.sin(a.rot)
  const cb = Math.cos(b.rot)
  const sb = Math.sin(b.rot)
  const axes: [number, number][] = [
    [ca, sa],
    [-sa, ca],
    [cb, sb],
    [-sb, cb],
  ]
  const cornersA = obbCorners(a)
  const cornersB = obbCorners(b)
  let bestDepth = Number.POSITIVE_INFINITY
  let bestNx = 0
  let bestNz = 0
  for (const [ax, az] of axes) {
    const pa = project(cornersA, ax, az)
    const pb = project(cornersB, ax, az)
    // Penetration along this axis; a non-positive value means a separating axis.
    const depth = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0])
    if (depth <= OVERLAP_EPSILON) return null
    if (depth < bestDepth) {
      bestDepth = depth
      // Orient the axis so it pushes A's centre away from B's centre.
      const dCenter = a.cx * ax + a.cz * az - (b.cx * ax + b.cz * az)
      const sign = dCenter < 0 ? -1 : 1
      bestNx = ax * sign
      bestNz = az * sign
    }
  }
  return { nx: bestNx, nz: bestNz, depth: bestDepth }
}

/** Returns true iff an OBB intersects the closed segment.
 *  SAT axes: OBB's two local axes + the segment's perpendicular. */
export function obbVsSegment(o: OBB, s: Segment): boolean {
  const c = Math.cos(o.rot)
  const sR = Math.sin(o.rot)
  const segDx = s.bx - s.ax
  const segDz = s.bz - s.az
  const segLen = Math.hypot(segDx, segDz)
  if (segLen === 0) return false
  const segUx = segDx / segLen
  const segUz = segDz / segLen
  const segNx = -segUz
  const segNz = segUx

  const corners = obbCorners(o)
  const segPts: [number, number][] = [
    [s.ax, s.az],
    [s.bx, s.bz],
  ]

  // Axis 1: OBB local X
  if (!overlap(project(corners, c, sR), project(segPts, c, sR))) return false
  // Axis 2: OBB local Z
  if (!overlap(project(corners, -sR, c), project(segPts, -sR, c))) return false
  // Axis 3: segment normal
  if (!overlap(project(corners, segNx, segNz), project(segPts, segNx, segNz))) return false
  // Axis 4: segment direction (clip OBB projection against segment span)
  const obbAlong = project(corners, segUx, segUz)
  const segAlong = project(segPts, segUx, segUz)
  if (!overlap(obbAlong, segAlong)) return false

  return true
}
