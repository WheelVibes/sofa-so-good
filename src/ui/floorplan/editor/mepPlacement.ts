/**
 * Pure MEP-point placement geometry (MEP layer, G1 PR3) — the wall-face snap
 * decision for the 2D editor's `'mep'` tool. Parameterised on an
 * already-computed `nearestWall()` hit (from `floorPlanGeometry.ts`) so this
 * module never re-implements wall search; it only decides whether/how a
 * placement point snaps onto the nearest wall.
 *
 * An electrical/plumbing point (socket, switch, water point, …) conventionally
 * sits ON the wall it serves, not floating mid-room — so a click within
 * `MEP_WALL_SNAP_THRESHOLD_M` of a wall's centreline snaps the point onto that
 * wall's FACE (offset half the wall's thickness from the centreline), on
 * whichever side the user actually clicked (so it lands on the room-side face,
 * not through the wall). A click further than the threshold — or with no wall
 * nearby at all (`hit` is `null`) — passes the raw (already grid/guide-snapped)
 * point through unsnapped.
 */
import type { PlanWall } from '../../../floorplan/types'
import type { WallHit } from './floorPlanGeometry'

/** Snap threshold (metres) — a click must land within this of a wall's
 *  CENTRELINE (not its face) to be considered "on that wall". */
export const MEP_WALL_SNAP_THRESHOLD_M = 0.25

export interface MepWallSnapResult {
  x: number
  z: number
  /** True when the point was pulled onto a wall face. */
  snapped: boolean
  /** The wall it snapped to, or `null` when unsnapped. */
  wallId: string | null
}

/**
 * Decide the placement point for a new MEP point given the raw (already
 * grid/guide-snapped) click and the nearest wall's hit-test result.
 *
 * `hit` is `null` when there are no walls at all, or none within the CALLER's
 * own wall-search radius (`nearestWall`'s own `maxDist`, independent of this
 * module's snap threshold) — either way the point passes through unsnapped.
 */
export function snapMepPointToWall(
  point: readonly [number, number],
  hit: WallHit | null,
  wallThicknessM: number,
  threshold = MEP_WALL_SNAP_THRESHOLD_M,
): MepWallSnapResult {
  const [px, pz] = point
  if (!hit || hit.dist > threshold) return { x: px, z: pz, snapped: false, wallId: null }
  const snapped = snapPointOntoWallFace(point, hit.wall, hit.offset, wallThicknessM)
  return { ...snapped, snapped: true, wallId: hit.wall.id }
}

/** Project a point onto a wall's face at a given along-wall offset, pushed
 *  out from the centreline by half the wall's thickness on whichever side
 *  `point` is on (so it lands on the room-side face the user clicked from,
 *  never through the wall). Straight-wall chord math — curved walls' `offset`
 *  is arc-length; using the chord direction here is an acceptable
 *  approximation given the small snap threshold. A zero-length wall (no
 *  direction to project onto) returns the raw point, unsnapped. */
function snapPointOntoWallFace(
  point: readonly [number, number],
  wall: PlanWall,
  offset: number,
  wallThicknessM: number,
): { x: number; z: number } {
  const [px, pz] = point
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  if (len === 0) return { x: px, z: pz }
  const ux = dx / len
  const uz = dz / len
  // Point on the wall centreline at `offset` along it.
  const cx = wall.start[0] + ux * offset
  const cz = wall.start[1] + uz * offset
  // Perpendicular (normal) direction — sign picked so it points toward the
  // clicked point (the side/room the user clicked from).
  const nx = -uz
  const nz = ux
  const side = (px - cx) * nx + (pz - cz) * nz >= 0 ? 1 : -1
  const half = Math.max(0, wallThicknessM) / 2
  return { x: cx + nx * half * side, z: cz + nz * half * side }
}
