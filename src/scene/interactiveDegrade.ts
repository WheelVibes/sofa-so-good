/**
 * GPU-STARVE-1 — interactive render-resolution degrade (pure decision).
 *
 * At the post-processing tiers (High/Maximum) a single frame during a camera
 * pan can cost hundreds of ms to seconds on an integrated GPU (DPR 2 × full-res
 * N8AO × bloom × SMAA × transmission). Frames that cross the OS GPU watchdog
 * threshold (Windows TDR ≈ 2 s) reset the driver and drop the WebGL context —
 * the canvas blanks to the page background until restore, seen as a random
 * full-screen white flash while panning.
 *
 * The fix is to shed fill-rate while (and only while) the camera is being
 * driven: halve the device-pixel-ratio for the duration of a camera gesture
 * (plus a short release debounce), and hold it down for a window after any
 * measured long frame so a spike-prone view can't keep tripping the watchdog.
 * Pixel count scales every screen-space pass quadratically, so half DPR ≈ ¼ the
 * frame cost — far below the watchdog, with a softness during motion the eye
 * doesn't resolve anyway.
 *
 * This module is the pure, unit-tested decision + the long-frame bookkeeping;
 * the live wiring (r3f `setDpr`, gesture events) is `InteractiveDprController`.
 */

export interface DegradeInputs {
  /** perf.now() at decision time (ms). */
  now: number
  /** A camera gesture (orbit rotate/pan/dolly) is currently held. */
  gestureActive: boolean
  /** perf.now() when the last gesture released (0 = never). */
  gestureEndedAt: number
  /** perf.now() of the last measured long frame (0 = never). */
  lastLongFrameAt: number
  /** The tier runs the post stack (High/Maximum) — the only tiers whose frame
   *  cost can approach the watchdog; lower tiers never degrade. */
  postprocessing: boolean
  /** The tier's DPR ceiling combined with the device DPR — the resolution the
   *  scene actually renders at when not degraded. */
  effectiveDpr: number
  /** Frame capture in progress — never degrade a recording's frames. */
  recording: boolean
}

/** Keep degrading for this long after the gesture releases, so OrbitControls'
 *  damping tail + an immediate re-grab render at the degraded cost too. */
export const RELEASE_DEBOUNCE_MS = 350

/** A rendered frame slower than this (while frames are being continuously
 *  driven) counts as a long frame — an order of magnitude under the ~2 s
 *  watchdog so the degrade engages well before a device reset is possible. */
export const LONG_FRAME_MS = 250

/** How long a long frame holds the degrade on after the fact. */
export const LONG_FRAME_HOLD_MS = 3000

/** Never degrade below this DPR — half resolution already quarters the frame
 *  cost; lower reads as smeary even in motion. */
export const MIN_DEGRADED_DPR = 0.5

/** The degraded pixel ratio: half the effective DPR, floored. Device DPR 2 →
 *  1 (crisp-enough motion); device DPR 1 → 0.5 (upscaled, still fluid). */
export function degradedDpr(effectiveDpr: number): number {
  return Math.max(MIN_DEGRADED_DPR, effectiveDpr * 0.5)
}

/** Should the renderer be running at the degraded DPR right now? */
export function shouldDegradeDpr(i: DegradeInputs): boolean {
  if (!i.postprocessing || i.recording) return false
  // Nothing to shed: already at (or below) the degraded resolution.
  if (i.effectiveDpr <= MIN_DEGRADED_DPR) return false
  if (i.gestureActive) return true
  if (i.gestureEndedAt > 0 && i.now - i.gestureEndedAt < RELEASE_DEBOUNCE_MS) return true
  if (i.lastLongFrameAt > 0 && i.now - i.lastLongFrameAt < LONG_FRAME_HOLD_MS) return true
  return false
}

// ---------------------------------------------------------------------------
// Long-frame bookkeeping (module singleton, written from useFrame).

let lastLongFrameAt = 0

/**
 * Record a rendered frame's delta. Only deltas measured while frames are being
 * continuously driven (a camera gesture, or the RenderPump's continuous mode)
 * are trusted — in demand mode an idle gap between two single frames can be
 * seconds long without any frame being slow.
 */
export function noteRenderedFrame(dtMs: number, continuouslyDriven: boolean, nowMs: number): void {
  if (continuouslyDriven && dtMs > LONG_FRAME_MS) lastLongFrameAt = nowMs
}

export function lastLongFrameTime(): number {
  return lastLongFrameAt
}

/** Test-only reset. */
export function __resetInteractiveDegrade(): void {
  lastLongFrameAt = 0
}
