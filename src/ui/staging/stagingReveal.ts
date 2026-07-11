/**
 * Before/after staging reveal — capture orchestration (pure of React/three).
 *
 * Produces the two frames the reveal slider compares:
 *   - **after**  — the room as it is now (the furnished design)
 *   - **before** — the same camera view with all furniture transiently hidden
 *                  (the empty room), then the prior hidden-set restored
 *
 * All side effects (canvas capture, the hidden-set getters/setters, the settle
 * delay) are injected, so the orchestration is unit-testable without mounting a
 * component or a real renderer. The hidden-item set is visual-only + session-only
 * (not persisted, not in undo), so toggling it here never touches the saved design.
 */

/** A captured before/after pair as PNG data URLs. */
export interface StagingPair {
  /** The empty room (all furniture hidden). */
  before: string
  /** The furnished design (current view). */
  after: string
}

/** Injected effects for {@link captureStagingPair} — all impure work lives here. */
export interface StagingCaptureDeps {
  /** Current visual-only hidden item-id set (to restore afterwards). */
  getHiddenIds: () => string[]
  /** All placed item ids (the ones to hide for the empty-room frame). */
  getAllItemIds: () => string[]
  /** Restore the hidden set to an exact list (transient/visual). */
  setHiddenIds: (ids: string[]) => void
  /** Bulk hide/show a set of item ids (visual only). */
  setItemsHidden: (ids: string[], hidden: boolean) => void
  /** Grab the current scene frame as a PNG data URL, or null if unavailable. */
  capture: () => string | null
  /** Resolve after `ms` (lets the demand-loop re-render before a readback). */
  wait: (ms: number) => Promise<void>
  /** Settle delay between a visibility change and the capture (default 380ms). */
  settleMs?: number
}

/** Default settle delay — matches the render-compare capture cadence. */
const STAGING_SETTLE_MS = 380

/**
 * Capture the furnished ("after") frame, then transiently hide every piece of
 * furniture to capture the empty-room ("before") frame, always restoring the
 * caller's prior hidden set (even if a capture throws).
 *
 * Throws a user-facing message if the canvas isn't capturable (3D view closed)
 * or there's no furniture to reveal.
 */
export async function captureStagingPair(deps: StagingCaptureDeps): Promise<StagingPair> {
  const settle = deps.settleMs ?? STAGING_SETTLE_MS
  const allIds = deps.getAllItemIds()
  if (allIds.length === 0) {
    throw new Error('Add some furniture first — there’s nothing to reveal.')
  }

  // "After" = the current furnished view (whatever the user currently sees).
  await deps.wait(settle)
  const after = deps.capture()
  if (!after) throw new Error('Open the 3D view first, then capture the reveal.')

  // "Before" = the empty room: hide all furniture, capture, then restore.
  const prevHidden = deps.getHiddenIds()
  try {
    deps.setItemsHidden(allIds, true)
    await deps.wait(settle)
    const before = deps.capture()
    if (!before) throw new Error('Could not capture the empty room.')
    return { before, after }
  } finally {
    deps.setHiddenIds(prevHidden)
  }
}
