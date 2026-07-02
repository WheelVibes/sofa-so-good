/**
 * Module-level signal that fires once per rendered WebGL frame, emitted by
 * `FrameRenderedNotifier` inside BOTH Canvases (main + room editor).
 *
 * Consumer: the transition loading overlay's readiness-based hide
 * (`ui/loading/transitionHide.ts`) — it waits for real frames from the
 * swapped-in scene instead of guessing with a timer. Module signal, not a
 * Zustand slice, for the same reason as `finishDragSignal.ts`: this fires per
 * frame and must not trip the RenderPump's `subscribe(markDirty)`.
 */

type Listener = () => void

const _listeners = new Set<Listener>()

/** Called by FrameRenderedNotifier's useFrame — a WebGL frame is being drawn. */
export function notifyFrameRendered(): void {
  for (const l of [..._listeners]) l()
}

/** Subscribe to rendered frames. Returns the unsubscribe function. */
export function onFrameRendered(listener: Listener): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

/** Reset to initial state (for tests). */
export function _resetFrameRenderedSignal(): void {
  _listeners.clear()
}
