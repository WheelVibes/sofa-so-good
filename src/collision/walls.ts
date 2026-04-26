export interface CollisionWall {
  /** Endpoint A (X). */ ax: number;
  /** Endpoint A (Z). */ az: number;
  /** Endpoint B (X). */ bx: number;
  /** Endpoint B (Z). */ bz: number;
  /** Total wall thickness in metres. The wall body extends `thickness/2`
   *  on each side of the (ax,az)–(bx,bz) centerline. Placement collision
   *  uses this to treat walls as solid OBBs rather than zero-thickness
   *  lines, so furniture can't be pushed into the wall body. */
  thickness: number;
}

type Vec2 = [number, number];

/**
 * Given a current position, a desired position, a player radius, and
 * a list of wall segments in the X-Z plane, returns a new position that
 * does not penetrate any wall. The circle is allowed to slide along walls.
 *
 * Implemented in two passes (X then Z) so the player can slide along
 * axis-aligned walls — sufficient for HDB floor plans where every wall
 * is axis-aligned. For non-axis-aligned walls, swap to a generic
 * circle-vs-segment closest-point projection.
 */
export function resolveMovement(
  from: Vec2,
  to: Vec2,
  radius: number,
  walls: CollisionWall[],
): Vec2 {
  let [x, z] = from;
  const tx = to[0];
  const tz = to[1];

  // Pass 1: move in X.
  let nx = tx;
  for (const w of walls) {
    if (w.ax === w.bx) {
      const wx = w.ax;
      const zMin = Math.min(w.az, w.bz);
      const zMax = Math.max(w.az, w.bz);
      if (z < zMin - radius || z > zMax + radius) continue;
      if (x < wx && nx > wx - radius) nx = wx - radius;
      else if (x > wx && nx < wx + radius) nx = wx + radius;
    }
  }
  x = nx;

  // Pass 2: move in Z (using updated X).
  let nz = tz;
  for (const w of walls) {
    if (w.az === w.bz) {
      const wz = w.az;
      const xMin = Math.min(w.ax, w.bx);
      const xMax = Math.max(w.ax, w.bx);
      if (x < xMin - radius || x > xMax + radius) continue;
      if (z < wz && nz > wz - radius) nz = wz - radius;
      else if (z > wz && nz < wz + radius) nz = wz + radius;
    }
  }
  z = nz;

  return [x, z];
}

/**
 * Returns true if the segment from (ax,az) to (bx,bz) is blocked by any wall
 * (i.e. crosses a wall segment strictly between the endpoints). Endpoint
 * touches are ignored so a ray ending on a wall (the target door) doesn't
 * register as blocked.
 */
export function isLineOfSightBlocked(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  walls: CollisionWall[],
): boolean {
  const rx = bx - ax;
  const rz = bz - az;
  const eps = 1e-3;
  for (const w of walls) {
    const sx = w.bx - w.ax;
    const sz = w.bz - w.az;
    const denom = rx * sz - rz * sx;
    if (Math.abs(denom) < 1e-9) continue;
    const dx = w.ax - ax;
    const dz = w.az - az;
    const t = (dx * sz - dz * sx) / denom;
    const u = (dx * rz - dz * rx) / denom;
    if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) return true;
  }
  return false;
}
