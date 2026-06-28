/**
 * Single source of truth for resolving a plan room's floor/wall finish.
 *
 * Finishes are edited live in the `finishes` slice (keyed by room id — the
 * fixed flat's RoomIds AND custom-plan room ids), while plan data carries its
 * own per-room `floor`/`wall` defaults (template-authored, saved-plan library,
 * 2D inspector). The setters write through to the active plan, so the slice
 * and the plan agree after any edit; these resolvers define the read order
 * for renderers: live slice → plan room → app default.
 */

import type { PlanRoom } from './types'

/** Default floor finish for plan rooms with no explicit pick. */
export const DEFAULT_PLAN_FLOOR = 'floor-wood-oak'

/** The finish maps the resolvers read (a structural subset of FinishesSlice).
 *  `ceiling` is optional so older callers / fixtures that predate ceiling
 *  finishes still satisfy the type. */
export interface RoomFinishMaps {
  floor: Record<string, string>
  walls: Record<string, string>
  ceiling?: Record<string, string>
}

/** The floor finish to render for a plan room. */
export function resolvePlanRoomFloor(finishes: RoomFinishMaps, room: PlanRoom): string {
  return finishes.floor[room.id] ?? room.floor ?? DEFAULT_PLAN_FLOOR
}

/** The wall finish to render for a plan room, or `null` for the neutral
 *  plaster shell (no finish was ever picked for this room). */
export function resolvePlanRoomWall(finishes: RoomFinishMaps, room: PlanRoom): string | null {
  return finishes.walls[room.id] ?? room.wall ?? null
}

/** The ceiling finish to render for a plan room, or `null` for the default
 *  plain white ceiling (no finish was ever picked for this room). Read order
 *  mirrors floor/wall: live slice → plan room default → null. */
export function resolvePlanRoomCeiling(finishes: RoomFinishMaps, room: PlanRoom): string | null {
  return finishes.ceiling?.[room.id] ?? room.ceilingFinish ?? null
}
