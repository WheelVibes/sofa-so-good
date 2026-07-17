/**
 * doorSnap.ts — snap a door-bound fixture (pet gates, pet-door inserts) onto
 * the nearest door opening (DOOR-FIXTURE).
 *
 * A sibling of `windowSnap.ts`: `doorBound` defs are statically placed ACROSS a
 * doorway and never moved/rotated/flipped afterwards. At placement time we
 * ignore the raw floor drop point and snap the fixture onto the nearest door
 * opening — landing it flush on the wall, centred on the doorway, facing the
 * room side the user aimed at. If the plan has no door the placement is rejected
 * (the caller shows a toast).
 *
 * Pure + render-agnostic (no three/React) so it can be unit-tested headlessly.
 * The opening world position + orientation mirror the renderer (a door centred
 * at `offset + width/2` along its wall, floor-anchored at the sill), exactly as
 * `windowSnap.snapToNearestWindow` does for windows.
 */

import type { PlanOpening, PlanWall } from '../../floorplan/types'
import type { ParamProps } from '../types'

/** The dimensions of a door opening a fixture is sizing itself to span. */
export interface SnapDoor {
  width: number
  /** Bottom edge above floor (m) — usually 0 for a door. */
  sill: number
  /** Top edge above floor (m) — the door head height. */
  head: number
}

export interface DoorSnapResult {
  /** Snapped world position (XZ, metres) — the door centre on the wall line. */
  position: [number, number]
  /** Yaw (radians) so the fixture faces the room interior (toward `dropPos`). */
  rotation: number
  /** The door opening that was snapped to. */
  openingId: string
  /** The snapped door's dimensions, for `doorFixtureProps` sizing. */
  door: SnapDoor
}

/** A wall keyed by id, for resolving an opening's host wall. */
function wallById(walls: ReadonlyArray<PlanWall>): Map<string, PlanWall> {
  const m = new Map<string, PlanWall>()
  for (const w of walls) m.set(w.id, w)
  return m
}

/**
 * Snap a door-bound fixture dropped at `dropPos` onto the nearest door opening.
 *
 * Returns the snapped transform, or `null` when there is no door to snap to
 * (no door openings, or none whose host wall resolves) — the caller then
 * rejects the placement.
 *
 * "Nearest" is by world distance from `dropPos` to each door's centre, so the
 * user naturally lands the fixture on the doorway they dropped beside. `dropPos`
 * also picks which side of the wall the fixture faces (the wall normal pointing
 * toward the drop point), matching the window-fixture convention.
 */
export function snapToNearestDoor(
  walls: ReadonlyArray<PlanWall>,
  openings: ReadonlyArray<PlanOpening>,
  dropPos: [number, number],
): DoorSnapResult | null {
  const byId = wallById(walls)
  let best: DoorSnapResult | null = null
  let bestDist = Number.POSITIVE_INFINITY

  for (const op of openings) {
    if (op.kind !== 'door') continue
    const wall = byId.get(op.wallId)
    if (!wall) continue
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const ux = dx / len
    const uz = dz / len
    // Door centre along the wall (offset is the door's start edge).
    const centreDist = op.offset + op.width / 2
    const wx = wall.start[0] + ux * centreDist
    const wz = wall.start[1] + uz * centreDist

    const ddx = dropPos[0] - wx
    const ddz = dropPos[1] - wz
    const dist = Math.hypot(ddx, ddz)
    if (dist >= bestDist) continue

    // Base orientation mirrors the wall (rotation.y = -atan2(dz, dx)); its local
    // +Z then points along the wall normal (-uz, ux). Flip by π so the facing
    // points toward the drop point (the room side the user aimed at).
    let rotation = -Math.atan2(dz, dx)
    const nx = -uz
    const nz = ux
    if (ddx * nx + ddz * nz < 0) rotation += Math.PI

    bestDist = dist
    best = {
      position: [wx, wz],
      rotation,
      openingId: op.id,
      door: { width: op.width, sill: op.sill, head: op.head },
    }
  }

  return best
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Door-aware sizing for a door-bound fixture, merged over its default props at
 * placement so it spans the doorway it snaps to (rather than a fixed catalog
 * size). Pure + unit-tested; clamped to each def's param ranges.
 *
 *  - **Pet gate** sizes its `width` to the door opening (a snug span).
 *  - **Pet-door insert** sizes its `width` to the door too (the flap panel fills
 *    the sill-height slice of the opening).
 *
 * Returns `{}` for any other def (no resizing).
 */
export function doorFixtureProps(defId: string, door: SnapDoor): ParamProps {
  if (defId === 'pet-gate') {
    return { width: clamp(door.width, 0.6, 1.4) }
  }
  if (defId === 'pet-door-insert') {
    return { width: clamp(door.width, 0.6, 1.4) }
  }
  return {}
}
