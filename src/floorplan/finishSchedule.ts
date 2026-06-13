/**
 * Per-room finishes schedule (PARITY-LIGHTINGTEMPLATE-TEXT — material callouts).
 *
 * Pure: lists every room (across storeys) with its resolved floor + wall finish
 * **names**, for the "Finishes schedule" sheet in the drawing set — the material
 * callout table a builder needs (Coohom / SH3D parity). `nameOf` maps a material
 * id to a display name (injected so this stays pure + unit-testable).
 *
 * Self-contained: imports only sibling pure modules + types.
 */

import { allPlanRooms } from './levels'
import { type RoomFinishMaps, resolvePlanRoomFloor, resolvePlanRoomWall } from './roomFinishes'
import type { FloorPlan } from './types'

export interface FinishRow {
  /** Room name. */
  room: string
  /** Resolved floor finish display name. */
  floor: string
  /** Resolved wall finish display name, or the neutral-plaster fallback. */
  wall: string
}

/** Shown when a room never had a wall finish picked (neutral plaster shell). */
export const NEUTRAL_WALL = 'Plaster (neutral)'

/**
 * Build the finishes schedule: one row per room (ground first, then upper
 * storeys), each carrying the resolved floor + wall finish names. Tolerates a
 * plan with no rooms (→ empty).
 */
export function buildFinishSchedule(
  plan: FloorPlan,
  finishes: RoomFinishMaps,
  nameOf: (id: string) => string,
): FinishRow[] {
  return allPlanRooms(plan).map((room) => {
    const floorId = resolvePlanRoomFloor(finishes, room)
    const wallId = resolvePlanRoomWall(finishes, room)
    return {
      room: room.name,
      floor: nameOf(floorId),
      wall: wallId ? nameOf(wallId) : NEUTRAL_WALL,
    }
  })
}
