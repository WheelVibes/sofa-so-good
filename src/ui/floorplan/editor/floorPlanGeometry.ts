/**
 * Pure 2D plan-geometry helpers extracted from the Floor Plan Editor — the
 * side-effect-free math the canvas leans on, free of React/DOM/store/three so
 * each function unit-tests in isolation. Every helper is parameterised on its
 * inputs (walls / rooms / points passed in explicitly), never reading editor or
 * component state.
 *
 * Coordinates are metres in the apartment frame (0,0 at the NW corner, +X east,
 * +Z south) — the same frame the rest of the app uses. Curved walls measure
 * against their arc (distance + arc-length offset); straight walls use the chord
 * projection (see `wallArc.ts`).
 */
import type { PlanRoom, PlanVec2, PlanWall } from '../../../floorplan/types'
import { wallLength } from '../../../floorplan/types'
import { isCurvedWall, nearestArcLength } from '../../../floorplan/wallArc'

/** A wall hit: the matched wall, the along-wall offset (m) of the projected
 *  point, and its perpendicular distance (m) to the cursor. */
export interface WallHit {
  wall: PlanWall
  offset: number
  dist: number
}

/**
 * The plan's visual centre — the middle of the bounding box of all wall
 * endpoints + room outlines (topmost↔bottommost, leftmost↔rightmost), NOT the
 * extent's half: the plan needn't start at world 0, and the editor wants that
 * box's middle centred in the canvas. When there is no geometry at all (no
 * walls, no rooms) it falls back to `fallback` (typically the extent halves).
 */
export function planCenter(
  walls: readonly PlanWall[],
  rooms: readonly PlanRoom[],
  fallback: PlanVec2,
): PlanVec2 {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const acc = (x: number, z: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  for (const w of walls) {
    acc(w.start[0], w.start[1])
    acc(w.end[0], w.end[1])
  }
  for (const r of rooms) {
    if (r.polygon && r.polygon.length >= 3) for (const [x, z] of r.polygon) acc(x, z)
    else {
      acc(r.origin[0], r.origin[1])
      acc(r.origin[0] + r.width, r.origin[1] + r.depth)
    }
  }
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minZ + maxZ) / 2] : fallback
}

/**
 * Nearest wall to a world point, with the projected along-wall offset and the
 * perpendicular distance. Curved walls measure against the arc (distance +
 * arc-length offset) so a click on the bulged span is detected and lands at the
 * right arc position; straight walls use the chord projection. Zero-length walls
 * are skipped. Returns the best hit only when it is within `maxDist` metres,
 * else `null` (no wall close enough, or no walls at all).
 */
export function nearestWall(
  walls: readonly PlanWall[],
  wx: number,
  wz: number,
  maxDist = 0.4,
): WallHit | null {
  let best: WallHit | null = null
  for (const wall of walls) {
    if (isCurvedWall(wall)) {
      const { offset, dist } = nearestArcLength(wall, [wx, wz])
      if (!best || dist < best.dist) best = { wall, offset, dist }
      continue
    }
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz)
    if (len === 0) continue
    const t = ((wx - wall.start[0]) * dx + (wz - wall.start[1]) * dz) / (len * len)
    const ct = Math.max(0, Math.min(1, t))
    const px = wall.start[0] + ct * dx
    const pz = wall.start[1] + ct * dz
    const dist = Math.hypot(wx - px, wz - pz)
    if (!best || dist < best.dist) best = { wall, offset: ct * len, dist }
  }
  return best && best.dist < maxDist ? best : null
}

/**
 * Along-wall distance (m) of a world point: arc-length on a curved wall, chord
 * projection on a straight one. Used to drag an opening along its wall. Unlike
 * `nearestWall` the projection is NOT clamped to the segment — a point beyond an
 * endpoint yields a negative offset or one past the wall length — so the caller
 * can detect drags that run off the wall. A zero-length wall returns 0.
 */
export function alongWall(wall: PlanWall, x: number, z: number): number {
  if (isCurvedWall(wall)) return nearestArcLength(wall, [x, z]).offset
  const len = wallLength(wall)
  if (len === 0) return 0
  const ux = (wall.end[0] - wall.start[0]) / len
  const uz = (wall.end[1] - wall.start[1]) / len
  return (x - wall.start[0]) * ux + (z - wall.start[1]) * uz
}
