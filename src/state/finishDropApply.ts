import type { RoomId } from '../apartment/types'
import type { FinishDragPayload, FinishDropAction } from '../materials/finishDrop'
import { decodeFinishDrag, FINISH_DND_MIME } from '../materials/finishDrop'
import { useStore } from './store'

/**
 * Shared store dispatch for a resolved finish drop (Q31) — the one place every
 * drop surface (Layers-panel rows, the 3D canvas raycast) commits a
 * `FinishDropAction`, so they stay behaviour-identical: each store setter
 * pushes its own history (one undo step per drop), floor/wall drops feed the
 * recents rows like a picker click, and a success toast confirms the apply.
 */

/** Read our payload off a DataTransfer; null for foreign drags (files, text). */
export function readFinishDragPayload(dt: DataTransfer | null): FinishDragPayload | null {
  if (!dt) return null
  return decodeFinishDrag(dt.getData(FINISH_DND_MIME))
}

/** True when a drag carries our finish payload (usable during dragover, where
 *  `getData` is not yet readable). */
export function isFinishDrag(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(FINISH_DND_MIME)
}

/**
 * Commit a resolved drop to the store. Returns true when something was
 * applied; null/unresolvable actions (foreign payload, empty-sky drop,
 * vanished item) are a safe no-op.
 */
export function applyFinishDropAction(action: FinishDropAction | null | undefined): boolean {
  if (!action) return false
  const st = useStore.getState()
  switch (action.type) {
    case 'floor':
      st.setFloorFinish(action.roomId as RoomId, action.finishId)
      break
    case 'wall':
      st.setWallFinish(action.roomId as RoomId, action.finishId)
      break
    case 'item': {
      if (!st.items.some((it) => it.id === action.itemId)) return false
      // Furniture consumes catalog finishes as `mat:<id>` (the DLC-material
      // convention QuickFinishes/inspector use) — normalise a raw catalog id so
      // the FurnitureMaterialLoader actually builds it; hex/`mat:` pass through.
      const finish =
        action.finishId.startsWith('#') || action.finishId.startsWith('mat:')
          ? action.finishId
          : `mat:${action.finishId}`
      st.updateItemProps(action.itemId, { finish })
      break
    }
    default:
      return false
  }
  // Room-surface drops feed the picker's recents, same as a swatch click.
  if (action.type !== 'item') {
    if (action.finishId.startsWith('#')) st.pushRecentColor(action.finishId)
    else st.pushRecentFinish(action.finishId)
  }
  const title =
    action.type === 'floor'
      ? 'Floor finish applied'
      : action.type === 'wall'
        ? 'Wall finish applied'
        : 'Finish applied'
  st.notify.start({ title, kind: 'success' })
  return true
}
