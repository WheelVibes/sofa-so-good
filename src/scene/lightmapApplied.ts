/**
 * "The baked GI has landed on the shell" — a module-level signal.
 *
 * ROOM-PROBES needs it. A per-room specular probe is captured by rendering the room, so it has
 * to be captured AFTER `VisibilityLightmaps` has attached the Cycles bake: capture it before and
 * every probe records the analytic fill instead of the baked one, which is a brighter, flatter
 * room and exactly the "still CG" look the probe exists to remove.
 *
 * A signal rather than a store field, matching `contextRestoreSignal` / `frameRenderedSignal`:
 * the lightmap applier is a plain function reached from an effect, and routing this through
 * Zustand would put a render-frequency write on the store for something only one component
 * reads.
 */

const listeners = new Set<() => void>()

/** Called by `VisibilityLightmaps` once `applyLightmapsFromIndex` has run. */
export function markLightmapsApplied(): void {
  for (const l of listeners) l()
}

/** Subscribe to lightmap attach passes. */
export function subscribeLightmapsApplied(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
