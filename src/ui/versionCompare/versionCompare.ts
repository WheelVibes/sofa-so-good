/**
 * Version split-view compare — capture orchestration (pure of React/three).
 *
 * Produces the two frames the reveal slider compares:
 *   - **current** — the room as it is now (the live design)
 *   - **saved**   — the same camera view with a SAVED version's design
 *                   temporarily swapped in, then the exact pre-swap state
 *                   restored
 *
 * Unlike `staging/stagingReveal.ts` (toggling visibility of the SAME item
 * set), a version compare briefly swaps in a DIFFERENT design (different
 * items/floor plan/finishes/palette) to capture it — an operation that must
 * never leak into undo history or the autosave slot. `withTemporaryDesign`
 * is the safety wrapper: it snapshots exactly the state keys the swap will
 * touch, suppresses history for both the swap-in and the restore, pauses
 * autosave for the whole window (regardless of how long the settle/capture
 * takes — no race with the debounce), and restores byte-for-byte (same
 * references) even if the capture throws.
 *
 * All side effects (store read/write, canvas capture, the settle delay) are
 * injected, so both helpers are unit-testable without mounting a component,
 * a real renderer, or a real Zustand store.
 */

/** Injected store access for a temporary design swap. Deliberately untyped
 *  against `RootState` (a `Record<string, unknown>` patch) so this module
 *  stays a plain, dependency-free helper — the caller (the React component)
 *  supplies the real store's `getState`/`setState`. */
export interface TemporaryDesignDeps {
  /** Read the CURRENT value of a set of state keys (used to snapshot exactly
   *  what a patch is about to overwrite, so it can be restored afterwards). */
  pick: (keys: string[]) => Record<string, unknown>
  /** Apply a patch of state keys (used both to swap the saved design in and
   *  to restore the original values back out). */
  apply: (patch: Record<string, unknown>) => void
  /** Suppress the undo/redo history stack for the duration of `fn` (the
   *  store's `runWithoutHistory`) — neither the swap-in nor the restore is a
   *  user edit, so neither may become an undo step. */
  runWithoutHistory: (fn: () => void) => void
  /** Pause autosave's write scheduling for the whole swap window — a
   *  temporary OTHER design must never reach the autosave slot, however long
   *  the swap holds the store. */
  pauseAutosave: () => void
  /** Resume autosave scheduling AFTER the restore, resyncing its watched
   *  snapshot to the (now-restored) live state. */
  resumeAutosave: () => void
}

/**
 * Apply `patch` to the live store for the duration of `fn`, then restore
 * every key `patch` touched to its exact pre-swap value — regardless of
 * whether `fn` throws. History is suppressed for both the swap-in and the
 * restore; autosave is paused for the whole window. Returns whatever `fn`
 * resolves to.
 */
export async function withTemporaryDesign<T>(
  patch: Record<string, unknown>,
  deps: TemporaryDesignDeps,
  fn: () => Promise<T> | T,
): Promise<T> {
  deps.pauseAutosave()
  const prev = deps.pick(Object.keys(patch))
  deps.runWithoutHistory(() => deps.apply(patch))
  try {
    return await fn()
  } finally {
    deps.runWithoutHistory(() => deps.apply(prev))
    deps.resumeAutosave()
  }
}

/** A captured current/saved pair as PNG data URLs. */
export interface VersionComparePair {
  /** The live design, as it is now. */
  current: string
  /** The saved version, temporarily rendered from the same camera. */
  saved: string
}

/** Injected effects for {@link captureVersionComparePair}. */
export interface VersionCompareCaptureDeps {
  /** The state patch (from `applySerialized`) that would restore the saved
   *  version — computed by the caller so this module needn't know about
   *  storage/schema. */
  getSavedPatch: () => Record<string, unknown>
  /** The temporary-swap deps (store access + history/autosave guards). */
  temporary: TemporaryDesignDeps
  /** Grab the current scene frame as a PNG data URL, or null if unavailable. */
  capture: () => string | null
  /** Resolve after `ms` (lets the demand-loop re-render before a readback). */
  wait: (ms: number) => Promise<void>
  /** Settle delay before each capture (default 380ms, matching the render
   *  compare / staging reveal cadence). */
  settleMs?: number
}

/** Matches the render-compare / staging-reveal settle cadence. */
const VERSION_COMPARE_SETTLE_MS = 380

/**
 * Capture the current design, then temporarily swap in the saved version
 * (via {@link withTemporaryDesign}) to capture it too — always restoring the
 * live design exactly, even if a capture throws.
 */
export async function captureVersionComparePair(
  deps: VersionCompareCaptureDeps,
): Promise<VersionComparePair> {
  const settle = deps.settleMs ?? VERSION_COMPARE_SETTLE_MS

  // "current" = the live design, as the user currently sees it.
  await deps.wait(settle)
  const current = deps.capture()
  if (!current) throw new Error('Open the 3D view first, then compare.')

  // "saved" = the chosen version, temporarily applied then restored.
  const patch = deps.getSavedPatch()
  const saved = await withTemporaryDesign(patch, deps.temporary, async () => {
    await deps.wait(settle)
    const png = deps.capture()
    if (!png) throw new Error('Could not capture the saved version.')
    return png
  })

  return { current, saved }
}
