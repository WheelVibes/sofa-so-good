import { ROOMS } from '../apartment/constants'
import { type RoomShell, roomShell } from '../apartment/roomShell'
import type { RoomId } from '../apartment/types'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { type PlanRoomShell, planRoomShell } from '../floorplan/planRoomShell'
import type { FloorPlan } from '../floorplan/types'

/** The active per-room editor shell, discriminated by plan kind. Both variants'
 *  shells expose `center` / `radius` / `contains`, so camera framing and the
 *  furniture room-filter can treat them uniformly; the renderer switches on
 *  `kind`. */
export type EditorRoomShell =
  | { kind: 'default'; shell: RoomShell }
  | { kind: 'plan'; shell: PlanRoomShell }

/**
 * Resolve the shell for the room being edited. Uses the built-in apartment
 * `roomShell` on the default plan, else the plan-derived `planRoomShell`.
 * Returns null when the id isn't a room of the active plan (e.g. a stale id).
 */
export function getRoomEditorShell(plan: FloorPlan, roomId: string): EditorRoomShell | null {
  if (isDefaultPlan(plan)) {
    // Guard against an unknown/stale id — `roomShell` would otherwise read
    // `ROOMS[id].origin` and throw, crashing the editor scene.
    if (!ROOMS[roomId as RoomId]) return null
    return { kind: 'default', shell: roomShell(roomId as RoomId) }
  }
  const shell = planRoomShell(plan, roomId)
  return shell ? { kind: 'plan', shell } : null
}
