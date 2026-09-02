import { ROOMS } from '../apartment/constants'
import { allPlanRooms } from '../floorplan/levels'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { useStore } from './store'

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
 * Order rooms **alphabetically by name** (the default), then apply an optional
 * manual override: ids listed in `order` come first, in that sequence; any room
 * not named there stays in the alphabetical tail. Pure + total.
 */
function orderRooms(rooms: EditableRoom[], order: readonly string[]): EditableRoom[] {
  const alpha = [...rooms].sort((a, b) => a.name.localeCompare(b.name))
  if (order.length === 0) return alpha
  const rank = new Map(order.map((id, i) => [id, i]))
  const rankOf = (id: string) =>
    rank.has(id) ? (rank.get(id) as number) : Number.POSITIVE_INFINITY
  return alpha.sort((a, b) => rankOf(a.id) - rankOf(b.id)) // stable → alpha tail preserved
}

/**
 * Editable rooms (id + name) for the active plan, in display order — the default
 * apartment's non-external rooms, or a custom plan's own rooms. The single
 * source of truth for every room switcher / "Edit a room" entry, so they never
 * drift on how custom plans vs the fixed flat are enumerated. Ordered
 * alphabetically by default; pass an explicit `order` (room ids) to override —
 * callers that omit it inherit the user's saved `roomOrder` preference.
 */
export function editableRooms(
  plan: FloorPlan,
  order: readonly string[] = useStore.getState().roomOrder,
): EditableRoom[] {
  const base = isDefaultPlan(plan)
    ? Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => ({ id: r.id as string, name: r.name }))
    : allPlanRooms(plan).map((r) => ({ id: r.id, name: r.name }))
  return orderRooms(base, order)
}

/** Ids of the editable rooms (see `editableRooms`), in display order. Shared by
 *  the room-cycle (`,`/`.`) shortcuts so they stay in sync with the switchers. */
export function editableRoomIds(
  plan: FloorPlan,
  order: readonly string[] = useStore.getState().roomOrder,
): string[] {
  return editableRooms(plan, order).map((r) => r.id)
}

/** The first editable room id of the active plan (what "Edit a room" dives into),
 *  or undefined when the plan has none. */
export function firstEditableRoomId(
  plan: FloorPlan,
  order: readonly string[] = useStore.getState().roomOrder,
): string | undefined {
  return editableRooms(plan, order)[0]?.id
}

/**
 * Friendly display name for a room id: the fixed apartment's name, else the
 * active plan's room name, else the raw id. Lets UI keyed on the built-in
 * `ROOMS` table (e.g. the wall-accent picker) read correctly for custom plans.
 */
export function roomDisplayName(roomId: string, plan: FloorPlan): string {
  return (
    ROOMS[roomId as keyof typeof ROOMS]?.name ??
    allPlanRooms(plan).find((r) => r.id === roomId)?.name ??
    roomId
  )
}
