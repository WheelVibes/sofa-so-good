/**
 * Lightweight module-level signal for whether a finish drag is currently
 * hovering a valid drop canvas (the 3D canvas or the room-editor canvas).
 *
 * This is intentionally NOT a Zustand store slice — drag events fire many
 * times per second during a drag, and routing them through the store would
 * trigger the RenderPump's `subscribe(markDirty)` callback on every
 * dragover tick, causing unnecessary frame churn. Instead we use a tiny
 * `useSyncExternalStore`-compatible singleton that:
 *   - `FinishDropSurface` writes to (set/clear on enter/leave/drop/dragend)
 *   - `FinishDragOverlay` reads to control its CSS ring visibility
 *
 * The subscribe pattern is the minimal contract for `useSyncExternalStore`;
 * it's also unit-testable without a DOM.
 */

type Listener = () => void

let _active = false
const _listeners = new Set<Listener>()

/** Notify all subscribers that the signal changed. */
function _notify(): void {
  for (const l of _listeners) l()
}

/** Set the drag-active flag. No-op when the value is already correct. */
export function setFinishDragActive(active: boolean): void {
  if (_active === active) return
  _active = active
  _notify()
}

/** Current snapshot — `useSyncExternalStore` getSnapshot. */
export function getFinishDragActive(): boolean {
  return _active
}

/** Subscribe — `useSyncExternalStore` subscribe param.
 *  Returns the unsubscribe function. */
export function subscribeFinishDrag(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

/** Reset to initial state (for tests). */
export function _resetFinishDragSignal(): void {
  _active = false
  _listeners.clear()
}
