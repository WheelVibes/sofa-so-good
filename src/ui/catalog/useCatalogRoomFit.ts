import { useMemo } from 'react'
import { freeRectsFromShellRects, type RoomFreeRect } from '../../catalog/roomFit'
import { getRoomEditorShell } from '../../scene/roomEditorShell'
import { useStore } from '../../state/store'

/**
 * The free-space rects of the room currently being edited, for the "fits this
 * room" catalog cue (CATALOG-FITS). `null` means "no cue" — either no room is
 * being edited (whole-flat orbit/walk view) or the active room id doesn't
 * resolve (a stale id) — callers must treat `null` as "don't show a fit cue",
 * never as "nothing fits".
 *
 * Reuses `getRoomEditorShell` (already unifies the built-in-apartment
 * `RoomShell` and custom-plan `PlanRoomShell`) — the exact same room geometry
 * the room editor's camera framing and furniture room-filter already use.
 */
export function useActiveRoomFreeRects(): RoomFreeRect[] | null {
  const active = useStore((s) => s.roomEditor.active)
  const roomId = useStore((s) => s.roomEditor.roomId)
  const plan = useStore((s) => s.floorPlan)
  return useMemo(() => {
    if (!active || !roomId) return null
    const shell = getRoomEditorShell(plan, roomId)
    return shell ? freeRectsFromShellRects(shell.shell.rects) : null
  }, [active, roomId, plan])
}
