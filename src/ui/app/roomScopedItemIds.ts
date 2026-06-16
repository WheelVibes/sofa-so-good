import { getRoomEditorShell } from '../../scene/roomEditorShell'
import type { useStore } from '../../state/store'

/** Ids of the furniture in the room currently being edited (the set the room
 *  editor renders). Used by the room-scoped select-all / cycle shortcuts. Falls
 *  back to all items when not in the editor (callers gate on `canEditScene`). */
export function roomScopedItemIds(s: ReturnType<typeof useStore.getState>): string[] {
  const { roomEditor, floorPlan, items } = s
  if (!roomEditor.active || !roomEditor.roomId) return items.map((i) => i.id)
  const shell = getRoomEditorShell(floorPlan, roomEditor.roomId)?.shell
  if (!shell) return items.map((i) => i.id)
  return items.filter((it) => shell.contains(it.position[0], it.position[1])).map((i) => i.id)
}
