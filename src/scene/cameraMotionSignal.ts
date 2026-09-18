/**
 * Shared signal: "the user is actively driving the camera" (an OrbitControls
 * rotate / pan / dolly gesture, mouse or touch). Written by `OrbitCamera`'s
 * `onStart`/`onEnd` and read per-tick by `InteractiveDprController` to engage
 * the interactive render-resolution degrade (GPU-STARVE-1). A plain module
 * singleton (no store round-trip, no React re-render) — same pattern as
 * `animatedSources`/`shadowRefreshSignal`.
 *
 * A count (not a boolean) so overlapping gestures (e.g. a second touch pointer
 * arriving mid-drag) can't clear the flag while one is still live. `endedAt`
 * lets the degrade decision hold through a short release debounce so a
 * drag→pause→drag rhythm doesn't thrash the pixel ratio.
 */

let active = 0
let endedAt = 0

/** OrbitControls `start` event — a camera gesture began. */
export function beginCameraGesture(): void {
  active += 1
}

/** OrbitControls `end` event — a camera gesture released. */
export function endCameraGesture(): void {
  if (active === 0) return
  active -= 1
  if (active === 0) endedAt = performance.now()
}

export function isCameraGestureActive(): boolean {
  return active > 0
}

/**
 * Force-releases every currently-held gesture at once (S2/TIER-GESTURE-END —
 * a mid-drag `setQualityTier` call). Distinct from `endCameraGesture()`,
 * which pairs with exactly one `beginCameraGesture()`: a tier switch must
 * guarantee the degrade winds down regardless of how many holders are live,
 * so this clears the count outright rather than decrementing it.
 *
 * Sets `endedAt` to NOW, not 0 — a switch that lands mid-gesture should read
 * exactly like a genuine release (still subject to `RELEASE_DEBOUNCE_MS`), not
 * like a gesture that never happened. A no-op when nothing is held, so it's
 * safe to call unconditionally.
 */
export function endAllCameraGestures(): void {
  if (active === 0) return
  active = 0
  endedAt = performance.now()
}

/** perf.now() when the last gesture fully released (0 = never). */
export function cameraGestureEndedAt(): number {
  return endedAt
}

/** Test-only reset. */
export function __resetCameraGesture(): void {
  active = 0
  endedAt = 0
}

// TIER-GESTURE-END verification: expose the live signal for the sweep harness
// (`scripts/dev-probes/sweep/record.mjs`'s 100ms sampler), which runs as real
// page JS with no import access to this module. Read-only, DEV-only — mirrors
// the `window.__wallOpacities`/`window.__three` pattern in `wallReveal.ts`/
// `DevCameraExpose.tsx`. Tree-shaken out of production by the DEV guard.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(
    window as unknown as { __cameraGesture?: () => { active: boolean; endedAt: number } }
  ).__cameraGesture = () => ({ active: isCameraGestureActive(), endedAt: cameraGestureEndedAt() })
}
