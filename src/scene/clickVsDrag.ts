/**
 * Distinguish a genuine click from the tail of a camera drag. Orbit-rotating the
 * view with a press-drag on the floor ends with a `pointerup` over the same mesh,
 * which three.js reports as a `click` — so a drag to rotate would otherwise fire
 * the room-floor "Enter <room>?" confirm. We record where each press started and
 * treat a release that moved beyond a small threshold as a drag, not a click.
 */
let downX = 0
let downY = 0

/** Whether the pointerdown that began the current gesture landed on a furniture
 *  item (which selects it + opens the inspector). Reset at the start of every
 *  gesture by the capture-phase listener below, then set by `Furniture`'s
 *  pointerdown. See {@link markPointerDownOnItem}. */
let pointerDownOnItem = false

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      downX = e.clientX
      downY = e.clientY
      // Capture phase fires before R3F's canvas pointerdown, so this reset always
      // precedes any `markPointerDownOnItem()` from the furniture hit this gesture.
      pointerDownOnItem = false
    },
    true,
  )
}

/** Record that the current gesture's pointerdown hit a furniture item. Called by
 *  `Furniture`'s pointerdown so the matching release doesn't deselect it. */
export function markPointerDownOnItem(): void {
  pointerDownOnItem = true
}

/** True when the in-flight gesture began on a furniture item. `deselectOnMiss`
 *  consults this so the release that *selected* an item can't immediately clear
 *  it: opening the inspector shrinks the canvas and shifts the item off the
 *  cursor, making the release's raycast miss and fire onPointerMissed
 *  (INSPECTOR-FLICKER). */
export function pointerDownStartedOnItem(): boolean {
  return pointerDownOnItem
}

/** Pixels of pointer travel above which a release is a drag, not a click. */
const DRAG_PX = 6

/** True when the release that produced this event moved far enough from its
 *  press to count as a drag (e.g. orbit-rotating the camera). */
export function isDragRelease(e: { clientX: number; clientY: number }): boolean {
  return Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX
}
