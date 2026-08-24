/**
 * What a click on a room floor should do — shared by the default flat's
 * `RoomFloor` and a custom plan's `PlanRoomFloor` so the two can't drift.
 *
 * They DID drift: `PlanRoomFloor` only ever handled the overview case, so on a
 * custom plan clicking the floor inside the room editor did nothing at all and
 * there was no way to open that room's finish picker by clicking its floor —
 * the gesture the default flat has always supported.
 *
 * Pure (booleans in, decision out) so both call sites and the tests agree.
 */
export type FloorClickAction =
  /** Inside the room editor: select the room, which opens the finish picker. */
  | 'select-room'
  /** View-only overview: dive into that room's editor (after a confirm). */
  | 'enter-room'
  /** Walk mode, a non-editable scene, anything else: ignore the click. */
  | 'none'

export function floorClickAction(s: {
  /** `canEditScene(state)` — true inside the room editor / plan editing. */
  canEdit: boolean
  cameraMode: string
  roomEditorActive: boolean
}): FloorClickAction {
  if (s.canEdit) return 'select-room'
  if (s.cameraMode === 'orbit' && !s.roomEditorActive) return 'enter-room'
  return 'none'
}
