/**
 * Oriented bounding box on the floor plane (XZ). Pure math — no React,
 * no three.js. Used by placement collision to test furniture against
 * walls (segments) and other furniture (OBBs).
 */

export interface OBB {
  cx: number;
  cz: number;
  /** Half-width along the OBB's local X axis. */
  hx: number;
  /** Half-depth along the OBB's local Z axis. */
  hz: number;
  /** Y-axis rotation in radians. */
  rot: number;
}

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Returns the 4 corner points of an OBB in world space, CCW. */
export function obbCorners(o: OBB): [number, number][] {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  // Local corners in CCW order: (-hx,-hz)(+hx,-hz)(+hx,+hz)(-hx,+hz)
  const local: [number, number][] = [
    [-o.hx, -o.hz],
    [o.hx, -o.hz],
    [o.hx, o.hz],
    [-o.hx, o.hz],
  ];
  return local.map(([lx, lz]) => [
    o.cx + lx * c - lz * s,
    o.cz + lx * s + lz * c,
  ]);
}

/** Project a set of points onto a 2D axis. Returns [min, max]. */
function project(points: [number, number][], ax: number, az: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of points) {
    const t = x * ax + z * az;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return [min, max];
}

function overlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** Returns true iff the two OBBs overlap (SAT, 4 axes). */
export function obbVsObb(a: OBB, b: OBB): boolean {
  const ca = Math.cos(a.rot);
  const sa = Math.sin(a.rot);
  const cb = Math.cos(b.rot);
  const sb = Math.sin(b.rot);
  const axes: [number, number][] = [
    [ca, sa],
    [-sa, ca],
    [cb, sb],
    [-sb, cb],
  ];
  const cornersA = obbCorners(a);
  const cornersB = obbCorners(b);
  for (const [ax, az] of axes) {
    if (!overlap(project(cornersA, ax, az), project(cornersB, ax, az))) {
      return false;
    }
  }
  return true;
}

/** Returns true iff an OBB intersects the closed segment.
 *  SAT axes: OBB's two local axes + the segment's perpendicular. */
export function obbVsSegment(o: OBB, s: Segment): boolean {
  const c = Math.cos(o.rot);
  const sR = Math.sin(o.rot);
  const segDx = s.bx - s.ax;
  const segDz = s.bz - s.az;
  const segLen = Math.hypot(segDx, segDz);
  if (segLen === 0) return false;
  const segUx = segDx / segLen;
  const segUz = segDz / segLen;
  const segNx = -segUz;
  const segNz = segUx;

  const corners = obbCorners(o);
  const segPts: [number, number][] = [
    [s.ax, s.az],
    [s.bx, s.bz],
  ];

  // Axis 1: OBB local X
  if (!overlap(project(corners, c, sR), project(segPts, c, sR))) return false;
  // Axis 2: OBB local Z
  if (!overlap(project(corners, -sR, c), project(segPts, -sR, c))) return false;
  // Axis 3: segment normal
  if (!overlap(project(corners, segNx, segNz), project(segPts, segNx, segNz))) return false;
  // Axis 4: segment direction (clip OBB projection against segment span)
  const obbAlong = project(corners, segUx, segUz);
  const segAlong = project(segPts, segUx, segUz);
  if (!overlap(obbAlong, segAlong)) return false;

  return true;
}
