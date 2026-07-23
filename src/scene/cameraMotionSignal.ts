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

/** perf.now() when the last gesture fully released (0 = never). */
export function cameraGestureEndedAt(): number {
  return endedAt
}

/** Test-only reset. */
export function __resetCameraGesture(): void {
  active = 0
  endedAt = 0
}
