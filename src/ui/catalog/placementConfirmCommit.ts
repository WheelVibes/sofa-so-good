/**
 * Bridge between the DOM `EditConfirmBar` (outside the R3F tree) and the armed
 * placement commit that lives inside `usePlacementController` (bugs #2/#5).
 *
 * The mobile "Place item?" pill's ✓ must run the SAME commit path the controller
 * uses (which needs the live catalog `def`, ghost world/validity, variant props,
 * and the drop-in animation) — so the controller registers its commit fn here
 * while a `placeConfirm` placement is armed, and the pill calls it. A plain-object
 * module signal is the sanctioned way for DOM UI to talk to a scene-side
 * controller (see src/scene/CLAUDE.md).
 */
let commitFn: (() => void) | null = null

export function registerPlacementCommit(fn: (() => void) | null): void {
  commitFn = fn
}

/** Commit the currently-armed placeConfirm placement (no-op if none registered). */
export function commitArmedPlacement(): void {
  commitFn?.()
}
