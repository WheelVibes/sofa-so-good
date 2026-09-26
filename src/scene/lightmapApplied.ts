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
let generation = 0

/** Called by `VisibilityLightmaps` once `applyLightmapsFromIndex` has run. */
export function markLightmapsApplied(): void {
  generation++
  for (const l of listeners) l()
}

/**
 * How many attach passes have landed this session — 0 means "no bake has been applied yet".
 *
 * A pure subscription has no MEMORY, and that cost the probe two and a half seconds on every
 * re-capture (R7-N). A subscriber mounting after the bake had already landed could not tell
 * "the maps are attached" from "the maps have not arrived yet", so every hour change fell through
 * to `RoomProbes`' 2.5 s grace timer and then logged its capture `[provisional]` — measured at
 * **5.6 s** from a deliberate single hour change to the re-captured probe. A COUNTER rather than a
 * boolean, so a consumer can also tell a LATER pass (a plan swap re-attaches) from the one it has
 * already captured against; a boolean would let a probe captured before a re-bake believe it was
 * already current.
 */
export function lightmapGeneration(): number {
  return generation
}

/** Subscribe to lightmap attach passes. */
export function subscribeLightmapsApplied(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
