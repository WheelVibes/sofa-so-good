import type { RootState } from './store'

/**
 * The single rule for whether scene editing is enabled. After the view/edit
 * split, all selection, picking, dragging, rotating, placement and finish
 * editing happen **only inside the per-room editor with the orbit camera**.
 * Orbit-over-the-whole-flat and walk mode are view-only (camera + navigation).
 *
 * Room-editor walk mode (the room-bounded first-person view) is also view-only,
 * so editing requires the orbit camera even there.
 */
export function canEditScene(s: Pick<RootState, 'roomEditor' | 'cameraMode'>): boolean {
  return s.roomEditor.active && s.cameraMode === 'orbit'
}
