import { useEffect } from 'react'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { isEditableTarget } from '../../controls/useKeyboard'
import { useCatalog } from '../../furniture/catalog'
import { defaultParamProps, type FurnitureDef, type ParamProps } from '../../furniture/types'
import { useStore } from '../../state/store'

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def)
  return def.scale != null ? { scale: def.scale } : {}
}

/**
 * While a catalog placement is armed (`activeDefId` set), tracks the
 * cursor for the ghost preview and commits / cancels on user input:
 *   - pointermove → updates cursor for PlacementGhost
 *   - left click on canvas with green ghost → commits, then disarms
 *   - left click on canvas with red ghost → ignored
 *   - right click or Escape → cancels
 * Clicks outside the canvas (e.g. catalog drawer, toolbar) are passed
 * through so the user can switch defs or interact with UI freely.
 */
export function usePlacementController() {
  const activeDefId = useStore((s) => s.activeDefId)
  const catalog = useCatalog()

  useEffect(() => {
    if (!activeDefId) return
    const def = catalog[activeDefId]
    if (!def) return

    const onMove = (ev: PointerEvent) => {
      useStore.getState().setCursor({ x: ev.clientX, y: ev.clientY })
    }
    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return
      if (!(ev.target instanceof HTMLCanvasElement)) return
      const { ghostWorld, ghostValid, addItem, cancelPlacement } = useStore.getState()
      if (!ghostWorld || !ghostValid) {
        // Red ghost — swallow the click so it doesn't deselect or do
        // anything else; user must move to a green spot first.
        ev.preventDefault()
        ev.stopPropagation()
        return
      }
      ev.preventDefault()
      ev.stopPropagation()
      addItem({
        defId: def.id,
        position: ghostWorld,
        rotation: (def.defaultRotation ?? 0) + useStore.getState().ghostRotation,
        props: defaultProps(def),
      })
      // Shift-click keeps the placement armed (with the same orientation) so a
      // row of identical pieces can be dropped one after another; a plain click
      // disarms. The ghost goes red over the piece just placed until moved.
      if (!ev.shiftKey) cancelPlacement()
    }
    const onContext = (ev: MouseEvent) => {
      ev.preventDefault()
      useStore.getState().cancelPlacement()
    }
    const onKey = (ev: KeyboardEvent) => {
      // A modal over an armed placement owns the keyboard (incl. Escape).
      if (isAnyModalOpen()) return
      if (isEditableTarget(ev)) return
      if (ev.code === 'Escape') {
        useStore.getState().cancelPlacement()
        return
      }
      // R rotates the ghost before committing, so a piece lands facing the right
      // way (Shift = fine 15°, else 90°). Mirrors the placed-item R shortcut.
      if (ev.code === 'KeyR') {
        ev.preventDefault()
        useStore.getState().rotateGhost((ev.shiftKey ? 15 : 90) * (Math.PI / 180))
      }
    }

    // HTML5 drag-and-drop from a catalog card (desktop): dragging arms placement
    // (onDragStart on the card), so this effect is live during the drag. Pointer
    // events are suppressed mid-drag, so the ghost is driven by dragover here,
    // and the drop commits using the same ghostWorld/ghostValid the click path
    // uses — reusing the entire preview + validity pipeline.
    const onDragOver = (ev: DragEvent) => {
      // Allow dropping on the canvas and keep the ghost following the cursor.
      ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
      useStore.getState().setCursor({ x: ev.clientX, y: ev.clientY })
    }
    const onDrop = (ev: DragEvent) => {
      ev.preventDefault()
      if (!(ev.target instanceof HTMLCanvasElement)) {
        useStore.getState().cancelPlacement()
        return
      }
      const { ghostWorld, ghostValid, addItem, cancelPlacement } = useStore.getState()
      if (ghostWorld && ghostValid) {
        addItem({
          defId: def.id,
          position: ghostWorld,
          rotation: (def.defaultRotation ?? 0) + useStore.getState().ghostRotation,
          props: defaultProps(def),
        })
      }
      cancelPlacement()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [activeDefId, catalog])
}
