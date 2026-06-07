import { ROOMS } from '../apartment/constants'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'

/**
 * Ids of the editable rooms for the active plan, in display order — the default
 * apartment's non-external rooms, or a custom plan's own rooms. Shared by the
 * room switcher and the room-cycle (`,`/`.`) shortcuts so they stay in sync.
 */
export function editableRoomIds(plan: FloorPlan): string[] {
  return isDefaultPlan(plan)
    ? Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => r.id as string)
    : plan.rooms.map((r) => r.id)
}
