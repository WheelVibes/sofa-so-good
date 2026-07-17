/**
 * Module-level request channel for the walk-mode point-to-point measure
 * "set point" action (WALK-MEASURE) — mirrors `walkTeleport.ts`'s plain-object
 * signal pattern so the WalkHud "Set point" button / the `walkMeasurePoint`
 * keybinding (both outside the R3F tree) can ask `FirstPersonCamera`'s frame
 * loop (inside it) to raycast the current aim and cycle a measure point,
 * without threading refs across the component tree. A press is a
 * once-per-event request, not per-frame state, so `FirstPersonCamera` polls
 * `consumeWalkMeasureRequest()` once per frame and clears it — same reasoning
 * as `cameras/walkTeleport.ts`'s "why not Zustand" note in `src/scene/CLAUDE.md`.
 */

let pending = false

/** Called by the WalkHud "Set point" button / the `walkMeasurePoint` keybinding. */
export function requestWalkMeasurePoint(): void {
  pending = true
}

/** Polled by `FirstPersonCamera`'s frame loop; clears the request once read
 *  so it applies exactly once. */
export function consumeWalkMeasureRequest(): boolean {
  const r = pending
  pending = false
  return r
}

/** Drops any pending request without applying it — called when the walker
 *  unmounts (leaving walk mode) so a stale press never fires into a later
 *  session. Also used to reset state between tests. */
export function _resetWalkMeasureRequest(): void {
  pending = false
}
