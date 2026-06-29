/**
 * Distinguish a genuine click from the tail of a camera drag. Orbit-rotating the
 * view with a press-drag on the floor ends with a `pointerup` over the same mesh,
 * which three.js reports as a `click` — so a drag to rotate would otherwise fire
 * the room-floor "Enter <room>?" confirm. We record where each press started and
 * treat a release that moved beyond a small threshold as a drag, not a click.
 */
let downX = 0
let downY = 0

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      downX = e.clientX
      downY = e.clientY
    },
    true,
  )
}

/** Pixels of pointer travel above which a release is a drag, not a click. */
const DRAG_PX = 6

/** True when the release that produced this event moved far enough from its
 *  press to count as a drag (e.g. orbit-rotating the camera). */
export function isDragRelease(e: { clientX: number; clientY: number }): boolean {
  return Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_PX
}
