/**
 * Signal fired when the procedural BASE_SIZE changes (PROCEDURAL-BAKE-STALE).
 *
 * `QualityController` writes the base size from an EFFECT keyed on the tier, so the
 * render that reacts to a tier change runs BEFORE the write and resolves its material
 * at the OLD size — and since nothing re-renders afterwards, a mounted surface keeps
 * whichever generation it happened to resolve. That is why subscribing a material hook
 * to `qualityTier` does not work (tried and reverted in v0.31.5.37): the subscriber
 * wakes at exactly the wrong moment.
 *
 * Subscribing to the SIZE instead inverts the order — the notification cannot fire
 * until the new value is already readable. The counter is the `useSyncExternalStore`
 * snapshot rather than the size itself so the store contract is trivially satisfied
 * (a monotonic number, never a fresh object).
 *
 * Pattern mirrors `proceduralSwapSignal.ts`.
 */

type Listener = () => void

let _version = 0
const _listeners = new Set<Listener>()

/** Bump the version and notify. Called by `setProceduralBaseSize` on a real change. */
export function notifyProceduralBaseSize(): void {
  _version++
  for (const l of _listeners) l()
}

/** Subscribe — `useSyncExternalStore` subscribe param. Returns unsubscribe fn. */
export function subscribeProceduralBaseSize(listener: Listener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

/** Monotonic version — `useSyncExternalStore` snapshot param. */
export function getProceduralBaseSizeVersion(): number {
  return _version
}
