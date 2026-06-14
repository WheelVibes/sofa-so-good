/**
 * Pure wall-editing operations for the 2D plan editor (PARITY-WALLOPS) — reverse
 * a wall's direction and join a wall with a collinear neighbour. Both keep every
 * opening (door/window) physically in place by re-measuring its offset, so the
 * geometry is identical before/after apart from the intended change. No three/
 * React imports — unit-tested here per the floorplan rules.
 */
import type { PlanOpening, PlanVec2, PlanWall } from './types'

const EPS = 1e-3

function wallLen(w: PlanWall): number {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
}

function unit(w: PlanWall): PlanVec2 {
  const L = wallLen(w)
  return L < EPS ? [0, 0] : [(w.end[0] - w.start[0]) / L, (w.end[1] - w.start[1]) / L]
}

function samePoint(a: PlanVec2, b: PlanVec2): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS
}

/** Whether two walls lie on the same line (parallel directions, cross ≈ 0). */
function collinear(a: PlanWall, b: PlanWall): boolean {
  const [ax, ay] = unit(a)
  const [bx, by] = unit(b)
  return Math.abs(ax * by - ay * bx) < 1e-3
}

export interface WallOpResult {
  walls: PlanWall[]
  openings: PlanOpening[]
}

/**
 * Editable wall length/angle (PARITY-WALLDIM) — pure geometry for the inspector's
 * exact "Length (m)" + "Angle (°)" fields. Both keep the wall's `start` fixed and
 * move only its `end`, matching the existing endpoint Num fields (the start stays
 * joined to its neighbour). Compass convention: the bearing is the start→end
 * vector measured from +X toward +Z, normalised to [0,360).
 */
export function wallAngleDeg(w: PlanWall): number {
  const a = (Math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]) * 180) / Math.PI
  return ((a % 360) + 360) % 360
}

/** New `end` that makes the wall exactly `lengthM` long (≥1 cm), keeping its
 *  start + direction. A zero-length wall defaults to running along +X. */
export function endForLength(w: PlanWall, lengthM: number): PlanVec2 {
  const L = Math.max(0.01, lengthM)
  let [ux, uz] = unit(w)
  if (ux === 0 && uz === 0) {
    ux = 1
    uz = 0
  }
  return [w.start[0] + ux * L, w.start[1] + uz * L]
}

/** New `end` that rotates the wall to `angleDeg` (from +X toward +Z) about its
 *  start, keeping its current length. A zero-length wall is returned unchanged. */
export function endForAngle(w: PlanWall, angleDeg: number): PlanVec2 {
  const L = wallLen(w)
  if (L < EPS) return [w.end[0], w.end[1]]
  const r = (angleDeg * Math.PI) / 180
  return [w.start[0] + Math.cos(r) * L, w.start[1] + Math.sin(r) * L]
}

/**
 * Reverse a wall's start/end. Each opening on it keeps its physical position by
 * re-measuring its offset from the new start (`len - offset - width`). Returns
 * `null` if the wall is missing or degenerate.
 */
export function reverseWallGeometry(
  walls: PlanWall[],
  openings: PlanOpening[],
  id: string,
): WallOpResult | null {
  const w = walls.find((x) => x.id === id)
  if (!w) return null
  const L = wallLen(w)
  if (L < EPS) return null
  const reversed: PlanWall = { ...w, start: [...w.end], end: [...w.start] }
  return {
    walls: walls.map((x) => (x.id === id ? reversed : x)),
    openings: openings.map((o) =>
      o.wallId === id ? { ...o, offset: Math.max(0, L - (o.offset + o.width)) } : o,
    ),
  }
}

/** A wall (other than `a`) that shares an endpoint with `a` and is collinear. */
function findJoinPartner(walls: PlanWall[], a: PlanWall): PlanWall | undefined {
  return walls.find(
    (b) =>
      b.id !== a.id &&
      wallLen(b) > EPS &&
      (samePoint(a.start, b.start) ||
        samePoint(a.start, b.end) ||
        samePoint(a.end, b.start) ||
        samePoint(a.end, b.end)) &&
      collinear(a, b),
  )
}

/**
 * Join the wall `id` with a collinear neighbour that shares an endpoint, merging
 * them into one wall spanning the two outer endpoints (the inverse of Split).
 * Openings from both walls are re-homed onto the merged wall by projecting their
 * world endpoints onto it, so they stay put regardless of either wall's
 * direction. `genId` supplies the merged wall's fresh id. Returns the updated
 * arrays + `mergedId`, or `null` when there's no collinear neighbour.
 */
export function joinAdjacentWalls(
  walls: PlanWall[],
  openings: PlanOpening[],
  id: string,
  genId: (prefix: string) => string,
): (WallOpResult & { mergedId: string }) | null {
  const a = walls.find((x) => x.id === id)
  if (!a || wallLen(a) < EPS) return null
  const b = findJoinPartner(walls, a)
  if (!b) return null

  // Outer endpoints: the two that are NOT the shared corner.
  let outerA: PlanVec2
  let outerB: PlanVec2
  if (samePoint(a.end, b.start)) {
    outerA = a.start
    outerB = b.end
  } else if (samePoint(a.end, b.end)) {
    outerA = a.start
    outerB = b.start
  } else if (samePoint(a.start, b.start)) {
    outerA = a.end
    outerB = b.end
  } else {
    outerA = a.end
    outerB = b.start
  }

  const mergedId = genId('w')
  const merged: PlanWall = {
    ...a,
    id: mergedId,
    start: [...outerA],
    end: [...outerB],
    // Preserve external-ness if either segment was external.
    thickness: a.thickness === 'external' || b.thickness === 'external' ? 'external' : a.thickness,
  }
  const [mdx, mdy] = unit(merged)
  const m0 = merged.start
  const project = (p: PlanVec2) => (p[0] - m0[0]) * mdx + (p[1] - m0[1]) * mdy

  const rehome = (o: PlanOpening, host: PlanWall): PlanOpening => {
    const [ux, uy] = unit(host)
    const p0: PlanVec2 = [host.start[0] + ux * o.offset, host.start[1] + uy * o.offset]
    const p1: PlanVec2 = [
      host.start[0] + ux * (o.offset + o.width),
      host.start[1] + uy * (o.offset + o.width),
    ]
    const t0 = project(p0)
    const t1 = project(p1)
    return {
      ...o,
      wallId: mergedId,
      offset: Math.max(0, Math.min(t0, t1)),
      width: Math.abs(t1 - t0),
    }
  }

  return {
    walls: walls.flatMap((w) => (w.id === a.id ? [merged] : w.id === b.id ? [] : [w])),
    openings: openings.map((o) =>
      o.wallId === a.id ? rehome(o, a) : o.wallId === b.id ? rehome(o, b) : o,
    ),
    mergedId,
  }
}
