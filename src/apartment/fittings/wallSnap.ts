/**
 * WALL-SNAP — the shared "put a small MEP point on a wall FACE" maths, factored out of
 * `fittingModel.ts` when `plumbingModel.ts` needed exactly the same thing (WALL-SNAP-SHARED).
 *
 * One place resolves: the nearest straight wall to a plan point, which SIDE of that wall's
 * centreline the point lies on, which side is actually a room, and the world transform that
 * puts a plate/pipe proud of the wall face facing into the room. Duplicating this a second
 * time is how two renderers drift apart on wall thickness or yaw sign.
 *
 * Pure: no three, no store.
 */
import { planWallThickness } from '../../floorplan/planGeometry'
import { type FloorPlan, type PlanWall, pointInRoom } from '../../floorplan/types'

/** How far from a wall centreline a point may sit and still be mounted on that wall. */
export const WALL_SNAP_M = 0.6

/** Where a fitting ends up on a wall: world position, facing yaw, and the host wall's id. */
export interface WallPlacement {
  x: number
  y: number
  z: number
  /** Yaw about +Y so the fitting's +Z face points out of the wall into the room. */
  yaw: number
  wallId: string
}

export interface WallHit {
  wall: PlanWall
  /** Along-wall distance from `start`, metres. */
  offset: number
  /** Perpendicular distance, metres (unsigned). */
  dist: number
  /** Which side of the centreline the point lies: +1 = right-hand normal (−Z of the tangent). */
  side: 1 | -1
}

export function wallFrame(w: PlanWall): { ux: number; uz: number; len: number } | null {
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return null
  return { ux: dx / len, uz: dz / len, len }
}

/** Right-hand normal of a wall's start→end tangent — the plan's `swing: 'right'` side. */
export function rightNormal(w: PlanWall): [number, number] {
  const f = wallFrame(w)
  return f ? [f.uz, -f.ux] : [0, -1]
}

export function nearestStraightWall(
  walls: readonly PlanWall[],
  x: number,
  z: number,
): WallHit | null {
  let best: WallHit | null = null
  for (const wall of walls) {
    const f = wallFrame(wall)
    if (!f) continue
    const rx = x - wall.start[0]
    const rz = z - wall.start[1]
    const t = Math.max(0, Math.min(f.len, rx * f.ux + rz * f.uz))
    const px = wall.start[0] + f.ux * t
    const pz = wall.start[1] + f.uz * t
    const dist = Math.hypot(x - px, z - pz)
    if (best && dist >= best.dist) continue
    // Sign against the right-hand normal (uz, −ux).
    const s = (x - px) * f.uz + (z - pz) * -f.ux
    best = { wall, offset: t, dist, side: s < 0 ? -1 : 1 }
  }
  return best
}

function yawForNormal(nx: number, nz: number): number {
  // three: a group at yaw θ faces (sin θ, cos θ); we want the fitting's +Z to be the normal.
  return Math.atan2(nx, nz)
}

/**
 * Place a fitting of depth `depth` on `wall` at `offset` along it, on `side`, at height `y`:
 * centre proud of the wall face by half the depth, yaw facing out of the wall.
 */
export function placeOnWall(
  wall: PlanWall,
  plan: FloorPlan,
  offset: number,
  side: 1 | -1,
  y: number,
  depth: number,
): WallPlacement | null {
  const f = wallFrame(wall)
  if (!f) return null
  const [rnx, rnz] = rightNormal(wall)
  const nx = rnx * side
  const nz = rnz * side
  const half = planWallThickness(wall, plan) / 2
  const t = Math.max(0.05, Math.min(f.len - 0.05, offset))
  const cx = wall.start[0] + f.ux * t + nx * (half + depth / 2)
  const cz = wall.start[1] + f.uz * t + nz * (half + depth / 2)
  return { x: cx, y, z: cz, yaw: yawForNormal(nx, nz), wallId: wall.id }
}

/** The side of `wall` at `offset` that lies inside a room of the plan (+1 / −1), or null. */
export function roomSide(wall: PlanWall, plan: FloorPlan, offset: number): 1 | -1 | null {
  const f = wallFrame(wall)
  if (!f) return null
  const [nx, nz] = rightNormal(wall)
  const half = planWallThickness(wall, plan) / 2 + 0.15
  const px = wall.start[0] + f.ux * offset
  const pz = wall.start[1] + f.uz * offset
  const inRight = plan.rooms.some((r) => pointInRoom(r, px + nx * half, pz + nz * half))
  const inLeft = plan.rooms.some((r) => pointInRoom(r, px - nx * half, pz - nz * half))
  if (inRight && !inLeft) return 1
  if (inLeft && !inRight) return -1
  // Both sides are rooms (an internal partition) or neither: no single answer.
  return null
}
