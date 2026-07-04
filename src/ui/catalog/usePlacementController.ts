import { useEffect } from 'react'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { isEditableTarget } from '../../controls/useKeyboard'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useCatalog } from '../../furniture/catalog'
import { defaultItemProps as defaultProps } from '../../furniture/placement/defaultItemProps'
import { snapToNearestWindow, windowFixtureProps } from '../../furniture/placement/windowSnap'
import { isActiveDragPointer } from '../../scene/dragHelpers'
import { beginDrop } from '../../scene/placementDrop'
import { useStore } from '../../state/store'

/** A touch commit fires a synthetic `click` just after `pointerup` — but by then
 *  the armed-placement effect may have torn down (committing disarms it), so its
 *  own swallow can miss. This module-level flag + the always-on capture listener
 *  below swallow that one trailing canvas click regardless of teardown timing. */
let swallowNextCanvasClick = false

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

  // Always-on swallow for the trailing synthetic click after a touch commit (see
  // `swallowNextCanvasClick`). Independent of the armed effect so it fires even
  // after that effect tears down on commit.
  useEffect(() => {
    const onClickCapture = (ev: MouseEvent) => {
      if (swallowNextCanvasClick && ev.target instanceof HTMLCanvasElement) {
        swallowNextCanvasClick = false
        ev.preventDefault()
        ev.stopPropagation()
      }
    }
    window.addEventListener('click', onClickCapture, true)
    return () => window.removeEventListener('click', onClickCapture, true)
  }, [])

  useEffect(() => {
    if (!activeDefId) return
    const def = catalog[activeDefId]
    if (!def) return

    // MOBILE-3 (BUG-1/MOBILE-1 class): the pointerId driving this placement
    // drag. Unlike a canvas drag (BUG-1) or a gizmo/marquee gesture
    // (MOBILE-1/2), placement is armed off-window — a catalog-card long-press
    // timer that already fired before this effect's listeners exist — so
    // there's no `pointerdown` here to record the initiating id from. Instead
    // it's latched lazily onto the FIRST pointer event this effect observes
    // (normally the continuation of the same finger that armed it); every
    // later event from a *different* pointerId is a no-op via
    // `isActiveDragPointer`, so a second finger touching the canvas mid-drag
    // can't jitter the ghost or steal the commit/cancel. Reset to `null` once
    // a gesture concludes (touch up/cancel) so a stamp/shift placement that
    // keeps `activeDefId` armed for the next drop (no effect remount) lets
    // the following drop re-latch onto whichever finger drives it.
    let dragPointerId: number | null = null

    const onMove = (ev: PointerEvent) => {
      if (dragPointerId == null) dragPointerId = ev.pointerId
      if (!isActiveDragPointer(dragPointerId, ev.pointerId)) return
      useStore.getState().setCursor({ x: ev.clientX, y: ev.clientY })
    }
    // Window-bound fixtures (curtains/blinds/grilles, WINDOW-FIXTURE) snap onto the
    // nearest window opening: the raw drop point is ignored, the fixture lands flush
    // on the window facing the room side dropped toward, and a plan with no window
    // rejects the placement (toast). Returns whether the commit succeeded.
    const commitWindowBound = (dropPos: [number, number]): boolean => {
      const { floorPlan, addItem, notify, armedVariantProps } = useStore.getState()
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
        // Size the fixture to the window it snapped onto (wider than the glass;
        // curtains floor-to-ceiling, blinds covering the opening) — after any
        // catalog quick-look variant/tint (CATALOG-VARIANT) so a chosen fabric
        // colour survives, but sizing still wins for the props they actually share.
        props: {
          ...defaultProps(def),
          ...(armedVariantProps ?? {}),
          ...windowFixtureProps(def.id, snap.window, floorPlan.ceilingHeight),
        },
      })
      return true
    }
    /** Commit the armed placement at the current ghost. `keepArmed` keeps the
     *  placement live (stamp / shift) instead of resolving it to a pending
     *  tick/cross confirmation. Returns what happened. */
    const doCommit = (keepArmed: boolean): 'committed' | 'invalid' | 'none' => {
      const { ghostWorld, ghostValid, addItem, cancelPlacement } = useStore.getState()
      if (!ghostWorld) return 'none'
      // Window-bound fixtures bypass the floor-collision gate: they snap to a
      // window (the ghost stores the raw drop point) rather than resting on the
      // floor, so `ghostValid` (a floor placement check) doesn't apply. They
      // commit immediately (no tick/cross).
      if (def.windowBound) {
        if (commitWindowBound(ghostWorld) && !keepArmed) cancelPlacement()
        return 'committed'
      }
      if (!ghostValid) return 'invalid'
      // Capture the items array before the add so a cross (cancel) can revert the
      // placement wholesale.
      const priorItems = useStore.getState().items
      // A catalog quick-look swatch (CATALOG-VARIANT) armed this placement with an
      // extra finish/variant patch — merge it over the def's plain defaults so
      // every other schema default (size, form, weave, …) is untouched.
      const variantProps = useStore.getState().armedVariantProps
      const newId = addItem({
        defId: def.id,
        position: ghostWorld,
        rotation: (def.defaultRotation ?? 0) + useStore.getState().ghostRotation,
        props: variantProps ? { ...defaultProps(def), ...variantProps } : defaultProps(def),
      })
      // Tactile drop-in: ease the piece down onto the floor from a small height.
      beginDrop(newId, performance.now())
      // Stamp / shift keeps the placement armed for the next drop. Otherwise the
      // placement resolves to a pending tick/cross confirmation — the ghost is
      // disarmed but a long-press-hidden catalog stays hidden until the user
      // confirms/cancels (handled in confirm/cancelPendingEdit).
      if (!keepArmed) {
        useStore.getState().setActiveDefId(null)
        useStore.getState().setGhostWorld(null, false)
        useStore.getState().setPendingEdit({
          kind: 'placement',
          ids: [newId],
          originals: [],
          priorItems,
        })
      }
      return 'committed'
    }

    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return
      if (!(ev.target instanceof HTMLCanvasElement)) return
      // A touch commit already handled this gesture on pointerup; swallow its
      // trailing synthetic click.
      if (swallowNextCanvasClick) {
        swallowNextCanvasClick = false
        ev.preventDefault()
        ev.stopPropagation()
        return
      }
      // Swallow every armed-placement click on the canvas (committed, red-ghost
      // or empty) so it can't also deselect / fall through.
      ev.preventDefault()
      ev.stopPropagation()
      doCommit(ev.shiftKey || stampActive())
    }

    // Touch: a long-press on a catalog card arms placement + hides the catalog,
    // then the ghost follows the finger and the lift commits in one continuous
    // gesture. The trailing synthetic click is swallowed (above). A lift off the
    // canvas or on an invalid spot aborts (which reopens a hidden catalog).
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerType !== 'touch') return
      // A second finger's independent release must not end/commit THIS drag —
      // only the finger latched by `onMove` above may (MOBILE-3).
      if (!isActiveDragPointer(dragPointerId, ev.pointerId)) return
      // This gesture is concluding either way — forget the latch so a
      // stamp/shift drop that keeps placement armed re-latches on whichever
      // finger drives the next one.
      dragPointerId = null
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!(el instanceof HTMLCanvasElement)) {
        useStore.getState().cancelPlacement()
      } else if (doCommit(stampActive()) !== 'committed') {
        useStore.getState().cancelPlacement()
      }
      // Swallow the synthetic click that follows this touch lift.
      swallowNextCanvasClick = true
      window.setTimeout(() => {
        swallowNextCanvasClick = false
      }, 400)
    }
    // A touch interrupted by the OS/browser (e.g. an incoming system gesture)
    // fires `pointercancel` instead of `pointerup` — previously unhandled,
    // which left the placement armed indefinitely. Treat it as an abort
    // (never a commit, since the last-known ghost position may be stale) and
    // gate it the same way as the lift above.
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerType !== 'touch') return
      if (!isActiveDragPointer(dragPointerId, ev.pointerId)) return
      dragPointerId = null
      useStore.getState().cancelPlacement()
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
      // Drop-placed item commits via the shared path (→ pending tick/cross for a
      // normal item); a drop on an invalid spot / off-window aborts.
      if (doCommit(false) !== 'committed') useStore.getState().cancelPlacement()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [activeDefId, catalog])
}
