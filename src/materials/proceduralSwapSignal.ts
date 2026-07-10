/**
 * Lightweight signal fired when a procedural texture is hot-swapped from
 * the fallback sync texture to the higher-quality worker-generated result.
 *
 * The Canvas is in `frameloop="demand"` mode — it doesn't render
 * automatically. When the worker finishes and we mutate a material's maps,
 * we need to kick a fresh frame so the swap is visible immediately. Rather
 * than routing through the Zustand store (which would re-render every
 * subscriber), we use a tiny `useSyncExternalStore`-compatible singleton
 * that bumps a monotonically-increasing counter on each swap. A component
 * (or RenderPump) can subscribe and call `invalidate()` in response.
 *
 * Pattern mirrors `finishDragSignal.ts`.
 */

type Listener = () => void

let _swapCount = 0
const _listeners = new Set<Listener>()

function _notify(): void {
  for (const l of _listeners) l()
}

/** Increment the swap counter and notify all subscribers. */
export function notifyProceduralSwap(): void {
  _swapCount++
  _notify()
}

/** Subscribe — `useSyncExternalStore` subscribe param. Returns unsubscribe fn. */
export function subscribeProceduralSwap(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}
