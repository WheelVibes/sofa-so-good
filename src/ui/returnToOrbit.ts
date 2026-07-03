import { useStore } from '../state/store'

/**
 * True when the app is already on the default **orbit overview** screen: the
 * orbit camera looking at the whole home, with neither the per-room editor nor
 * the 2D floor-plan editor open. Every other screen (walk-through, room editor,
 * floor-plan editor) is "somewhere else" the brand mark can return you from.
 */
export function isOrbitOverview(s = useStore.getState()): boolean {
  return s.cameraMode === 'orbit' && !s.roomEditor.active && !s.floorPlanEditing
}

/**
 * Brand-mark action: from any non-overview screen, confirm and then return to
 * the orbit overview (exit the floor-plan editor / room editor / walk mode as
 * needed). No-op when already on the overview, so a stray tap there does
 * nothing. Modals/overlays are their own dismissable surfaces — this is only
 * wired to the persistent brand mark, so it never fights them.
 */
export async function confirmReturnToOrbit(): Promise<void> {
  if (isOrbitOverview()) return
  const ok = await useStore.getState().confirmAction({
    title: 'Return to orbit mode?',
    message: 'Leave this screen and go back to the orbit overview of your home.',
    confirmLabel: 'Return to orbit',
  })
  if (!ok) return
  const st = useStore.getState()
  if (st.floorPlanEditing) st.setFloorPlanEditing(false)
  if (st.roomEditor.active) st.exitRoomEditor()
  if (st.cameraMode !== 'orbit') st.setCameraMode('orbit')
}
