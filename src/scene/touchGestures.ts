/**
 * Window-level active-touch tracker so scene interaction handlers can tell a
 * genuine single-finger tap/drag from a multi-finger gesture (pinch-zoom /
 * two-finger pan).
 *
 * Bug #11: a multi-finger gesture must NEVER select or move furniture — it
 * belongs entirely to the camera (OrbitControls). Bug #12: a single-finger drag
 * only moves an item that was already selected (a first touch on an unselected
 * item selects it via the tap; it is never grabbed for a move in the same
 * gesture). Both need to know, from inside `Furniture`'s R3F pointer handlers,
 * how many fingers are currently down.
 *
 * A capture-phase window listener updates the set BEFORE R3F's canvas-level
 * pointer handlers run (capture flows window → target), so `activeTouchCount()`
 * read inside `Furniture.onPointerDown` already includes this finger.
 */
const activePointers = new Set<number>()
let gestureMultiTouch = false
let installed = false

/** Install the tracker once (idempotent). Call from a top-level effect. */
export function installTouchGestureTracker(): () => void {
  if (typeof window === 'undefined' || installed) return () => {}
  installed = true
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    activePointers.add(e.pointerId)
    if (activePointers.size > 1) gestureMultiTouch = true
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    activePointers.delete(e.pointerId)
    // The gesture's "was multi-touch" flag clears only once every finger lifts,
    // so a trailing single finger after a pinch can't be mistaken for a tap.
    if (activePointers.size === 0) gestureMultiTouch = false
  }
  window.addEventListener('pointerdown', onDown, { capture: true })
  window.addEventListener('pointerup', onUp, { capture: true })
  window.addEventListener('pointercancel', onUp, { capture: true })
  return () => {
    window.removeEventListener('pointerdown', onDown, { capture: true })
    window.removeEventListener('pointerup', onUp, { capture: true })
    window.removeEventListener('pointercancel', onUp, { capture: true })
    activePointers.clear()
    gestureMultiTouch = false
    installed = false
  }
}

/** Number of touch pointers currently down. */
export function activeTouchCount(): number {
  return activePointers.size
}

/** True if the in-progress gesture has had 2+ fingers down at any point (until
 *  all fingers lift) — a tap/click that rides such a gesture must not select. */
export function gestureIsMultiTouch(): boolean {
  return gestureMultiTouch
}
