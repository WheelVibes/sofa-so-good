/**
 * Lightweight module-level signal for the live dimensions of a multi-select
 * group-resize gesture (see `ResizeGizmo`). Holds the selection bounding box's
 * current width × depth in metres, or `null` when no resize is in progress.
 *
 * Deliberately NOT a Zustand slice — a resize drag fires `pointermove` many
 * times per second; routing each tick through the store would wake the
 * RenderPump's `subscribe(markDirty)` on every event (frame churn). The gizmo
 * already writes candidate transforms to the store per move; this signal only
 * carries the derived readout to the DOM HUD, using the same
 * `useSyncExternalStore` contract as `finishDragSignal`.
 *
 *   - `ResizeGizmo` writes on each move (set) and clears on release (clear).
 *   - `ResizeHud` reads to render its dimension pill.
 */

/** Live group-resize dimensions, in metres. */
export interface ResizeReadout {
  /** East–west extent (X). */
  w: number
  /** North–south extent (Z). */
  d: number
}

type Listener = () => void

let _readout: ResizeReadout | null = null
const _listeners = new Set<Listener>()

function _notify(): void {
  for (const l of _listeners) l()
}

/** Publish the current group-resize dimensions. No-op when unchanged. */
export function setResizeReadout(next: ResizeReadout | null): void {
  if (_readout === next) return
  if (_readout && next && _readout.w === next.w && _readout.d === next.d) {
    return
  }
  _readout = next
  _notify()
}

/** Clear the readout (resize ended). */
export function clearResizeReadout(): void {
  setResizeReadout(null)
}

/** Current snapshot — `useSyncExternalStore` getSnapshot. */
export function getResizeReadout(): ResizeReadout | null {
  return _readout
}

/** Subscribe — `useSyncExternalStore` subscribe param. Returns unsubscribe. */
export function subscribeResizeReadout(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

/** Reset to initial state (for tests). */
export function _resetResizeReadout(): void {
  _readout = null
  _listeners.clear()
}
