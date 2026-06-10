import { useStore } from './store'

/**
 * Confirm, then enter the per-room editor for `roomId`. Clicking a room's floor
 * in the orbit overview is an easy thing to do by accident while looking around,
 * and entering the editor swaps the whole scene — so we ask first ("Enter
 * <room>?") via the themed confirm modal. Used by every overview room-floor
 * click target (default flat + custom plans).
 */
export async function confirmAndEnterRoom(roomId: string): Promise<void> {
  const s = useStore.getState()
  const room = s.floorPlan.rooms.find((r) => r.id === roomId)
  const name = room?.name ?? 'this room'
  const ok = await s.confirmAction({
    title: `Enter ${name}?`,
    message: `Open the room editor to furnish and finish ${name}.`,
    confirmLabel: 'Enter room',
  })
  if (ok) useStore.getState().enterRoomEditor(roomId)
}
