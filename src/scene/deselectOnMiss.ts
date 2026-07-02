import { useStore } from '../state/store'
import { isDragRelease, pointerDownStartedOnItem } from './clickVsDrag'

/**
 * Canvas `onPointerMissed` handler: a click/tap that lands on empty space (no
 * furniture, room floor or wall) clears the current selection — which also
 * closes the inspector / finish-picker panels keyed off it. Skips the tail of a
 * camera drag (so orbit-rotating on empty space doesn't deselect) and any
 * non-primary button, and leaves an armed catalog placement alone (its own
 * controller owns those clicks).
 */
export function deselectOnMiss(e: MouseEvent): void {
  if (e.button !== 0) return
  if (isDragRelease(e)) return
  // Don't let the release of a gesture that just selected an item deselect it:
  // the inspector opening resizes the canvas, so this release's raycast can miss
  // the shifted item and fire onPointerMissed here (INSPECTOR-FLICKER).
  if (pointerDownStartedOnItem()) return
  const s = useStore.getState()
  if (s.activeDefId) return
  // No-op when nothing is selected so we don't churn the store on every stray
  // background tap.
  if (s.selectedItemIds.length === 0 && !s.selectedRoomId && !s.selectedWall) return
  s.selectItem(null)
}
