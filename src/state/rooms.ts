import { ROOMS } from '../apartment/constants'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'

/**
 * Ids of the editable rooms for the active plan, in display order — the default
 * apartment's non-external rooms, or a custom plan's own rooms. Shared by the
 * room switcher and the room-cycle (`,`/`.`) shortcuts so they stay in sync.
 */
export interface EditableRoom {
  id: string
  name: string
}

/**
 * Editable rooms (id + name) for the active plan, in display order — the default
 * apartment's non-external rooms, or a custom plan's own rooms. The single
 * source of truth for every room switcher / "Edit a room" entry, so they never
 * drift on how custom plans vs the fixed flat are enumerated.
 */
export function editableRooms(plan: FloorPlan): EditableRoom[] {
  return isDefaultPlan(plan)
    ? Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => ({ id: r.id as string, name: r.name }))
    : plan.rooms.map((r) => ({ id: r.id, name: r.name }))
}

/** Ids of the editable rooms (see `editableRooms`), in display order. Shared by
 *  the room-cycle (`,`/`.`) shortcuts so they stay in sync with the switchers. */
export function editableRoomIds(plan: FloorPlan): string[] {
  return editableRooms(plan).map((r) => r.id)
}

/** The first editable room id of the active plan (what "Edit a room" dives into),
 *  or undefined when the plan has none. */
export function firstEditableRoomId(plan: FloorPlan): string | undefined {
  return editableRooms(plan)[0]?.id
}

/**
 * Friendly display name for a room id: the fixed apartment's name, else the
 * active plan's room name, else the raw id. Lets UI keyed on the built-in
 * `ROOMS` table (e.g. the wall-accent picker) read correctly for custom plans.
 */
export function roomDisplayName(roomId: string, plan: FloorPlan): string {
  return (
    ROOMS[roomId as keyof typeof ROOMS]?.name ??
    plan.rooms.find((r) => r.id === roomId)?.name ??
    roomId
  )
}
