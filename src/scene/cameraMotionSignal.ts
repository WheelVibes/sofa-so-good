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

/**
 * WALK-GESTURE-LEASE (N1) last-resort watchdog. Every gesture source now owns a
 * guaranteed end, but a ref-count that leaks is invisible in production and
 * costs half the render resolution for the rest of the session — so poll this
 * from the render loop: if a gesture has been held for `GESTURE_WATCHDOG_MS`
 * without the camera pose changing at all, nobody is driving anything, and the
 * count is force-released (DEV also warns, because reaching here IS a bug in
 * whichever source leaked).
 *
 * `pose` is any stable string/number signature of the camera transform; the
 * watchdog only compares it for equality. Returns true on the tick it fired.
 */
export const GESTURE_WATCHDOG_MS = 10_000

let watchdogPose = ''
let watchdogArmed = false
let watchdogSince = 0

export function pollCameraGestureWatchdog(now: number, pose: string): boolean {
  if (active === 0) {
    watchdogArmed = false
    watchdogPose = pose
    return false
  }
  // `armed` rather than `since !== 0`: a poll at clock 0 is a real sample.
  if (!watchdogArmed || pose !== watchdogPose) {
    watchdogPose = pose
    watchdogArmed = true
    watchdogSince = now
    return false
  }
  if (now - watchdogSince < GESTURE_WATCHDOG_MS) return false
  if (import.meta.env.DEV) {
    console.warn(
      `[cameraMotionSignal] gesture watchdog: ${active} gesture(s) held for ` +
        `${Math.round(now - watchdogSince)} ms with no camera movement — forcing release. ` +
        'Some input source began a gesture without a matching end (see WALK-GESTURE-LEASE).',
    )
  }
  watchdogArmed = false
  endAllCameraGestures()
  return true
}

/** Test-only reset. */
export function __resetCameraGesture(): void {
  active = 0
  endedAt = 0
  watchdogPose = ''
  watchdogArmed = false
  watchdogSince = 0
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
