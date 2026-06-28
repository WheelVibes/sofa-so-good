import { useEffect } from 'react'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { isEditableTarget } from '../../controls/useKeyboard'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useCatalog } from '../../furniture/catalog'
import { snapToNearestWindow } from '../../furniture/placement/windowSnap'
import { defaultParamProps, type FurnitureDef, type ParamProps } from '../../furniture/types'
import { useStore } from '../../state/store'

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def)
  return def.scale != null ? { scale: def.scale } : {}
}

/** Sticky stamp placement is active only when the user armed it AND the feature
 *  is on — a defence-in-depth gate so a stale `stampMode` can never keep a click
 *  armed once the `stampPlace` flag is off (e.g. switched to Simple mode). */
function stampActive(): boolean {
  return useStore.getState().stampMode && isFeatureEnabled('stampPlace')
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
    // Window-bound fixtures (curtains/blinds/grilles, WINDOW-FIXTURE) snap onto the
    // nearest window opening: the raw drop point is ignored, the fixture lands flush
    // on the window facing the room side dropped toward, and a plan with no window
    // rejects the placement (toast). Returns whether the commit succeeded.
    const commitWindowBound = (dropPos: [number, number]): boolean => {
      const { floorPlan, addItem, notify } = useStore.getState()
      const snap = snapToNearestWindow(floorPlan.walls, floorPlan.openings, dropPos)
      if (!snap) {
        notify.start({
          kind: 'info',
          title: 'No window to place on',
          message: `${def.name} can only be placed on a window — this plan has none.`,
        })
        return false
      }
      addItem({
        defId: def.id,
        position: snap.position,
        rotation: snap.rotation,
        props: defaultProps(def),
      })
      return true
    }
    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return
      if (!(ev.target instanceof HTMLCanvasElement)) return
      const { ghostWorld, ghostValid, addItem, cancelPlacement } = useStore.getState()
      if (!ghostWorld) {
        ev.preventDefault()
        ev.stopPropagation()
        return
      }
      // Window-bound fixtures bypass the floor-collision gate: they snap to a
      // window (the ghost stores the raw drop point) rather than resting on the
      // floor, so `ghostValid` (a floor placement check) doesn't apply.
      if (def.windowBound) {
        ev.preventDefault()
        ev.stopPropagation()
        commitWindowBound(ghostWorld)
        if (!ev.shiftKey && !stampActive()) cancelPlacement()
        return
      }
      if (!ghostValid) {
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
      // Keep the placement armed when stamping: either an explicit Shift-click
      // (one-off) or sticky stamp mode (PARITY-STAMP-PLACE — stays armed across
      // many plain clicks until Escape / Done). Otherwise a plain click commits
      // once and disarms. The ghost goes red over the piece just placed until
      // moved. Each commit is its own addItem ⇒ its own undo step.
      if (!ev.shiftKey && !stampActive()) cancelPlacement()
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
      if (ghostWorld && def.windowBound) {
        commitWindowBound(ghostWorld)
      } else if (ghostWorld && ghostValid) {
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
