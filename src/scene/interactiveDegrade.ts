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
  /** The DEVICE's own pixel ratio (`window.devicePixelRatio`) — the resolution
   *  the display actually has, which `effectiveDpr` may already be below. Used
   *  for the MOBILE-POLISH degrade FLOOR (see {@link degradedDpr}). */
  devicePixelRatio?: number
  /** A coarse-pointer (touch) device — MOBILE-POLISH shortens the long-frame
   *  hold there, see {@link longFrameHoldMs}. */
  coarsePointer?: boolean
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

/**
 * MOBILE-POLISH — the same hold on a COARSE-POINTER device.
 *
 * The 3 s hold is a Windows-TDR-shaped constant: a desktop iGPU that produced
 * one 250 ms frame is likely to produce another, and a watchdog reset there
 * costs the whole WebGL context. On a phone the arithmetic is different and it
 * was measured to be self-sustaining: at `realistic`/`weak` on a DPR-3 handset
 * the degrade's own drawing-buffer resize (which CLEARS the buffer and forces a
 * synchronous full repaint, GPU-STARVE-3) is itself a long frame, so every
 * expiry re-armed the hold and the renderer never returned to full resolution.
 * Measured at rest, 10 s, no input: `getPixelRatio()` oscillated 2 → 1 → 2 and
 * spent most of the window at 1, which the user sees as the picture
 * periodically going soft while nothing is happening.
 *
 * 1 s still covers a genuine spike's immediate neighbourhood while letting the
 * ratio heal inside one settle tail.
 */
export const LONG_FRAME_HOLD_COARSE_MS = 1000

/** The hold window for this device. Pure. */
export function longFrameHoldMs(coarsePointer: boolean): number {
  return coarsePointer ? LONG_FRAME_HOLD_COARSE_MS : LONG_FRAME_HOLD_MS
}

/**
 * MOBILE-POLISH — the degrade may never render finer than half the DEVICE's own
 * pixel ratio. Below that the upscale is visible as blocking rather than as
 * softness.
 *
 * `MIN_DEGRADED_DPR` alone is a floor in RENDER pixels and says nothing about
 * how many DISPLAY pixels each one has to cover. On a DPR-1 laptop 0.5 means one
 * render pixel per 2x2 screen pixels; on a DPR-3 phone the same absolute numbers
 * mean 1 render pixel per 6x6 — 36 device pixels each, on a 460 ppi panel where
 * the user is holding the screen 30 cm from their eye.
 */
export const DEGRADE_FLOOR_OF_DEVICE = 0.5

/** Never degrade below this DPR — half resolution already quarters the frame
 *  cost; lower reads as smeary even in motion. */
export const MIN_DEGRADED_DPR = 0.5

/**
 * The degraded pixel ratio: half the effective DPR, floored twice — at the
 * absolute `MIN_DEGRADED_DPR` and at half the DEVICE's own ratio
 * (`DEGRADE_FLOOR_OF_DEVICE`) — and never above `effectiveDpr`, since degrading
 * must never UPsize the buffer.
 *
 * Measured pixel counts at the reported 390x844 CSS viewport on a DPR-3 iPhone
 * (device buffer 1170x2532 = 2.96 Mpx):
 *
 * | ratio | drawing buffer | Mpx  | device px per render px |
 * | ----- | -------------- | ---- | ----------------------- |
 * | 2 (full, `dprMax`) | 780x1688 | 1.32 | 2.25 |
 * | 1.5 (**new floor**) | 585x1266 | 0.74 | 4 |
 * | 1 (old degrade) | 390x844 | 0.33 | 9 |
 * | 0.5 (old degrade with the `dprHalved` rung) | 195x422 | 0.08 | **36** |
 *
 * The old rule reached both bottom rows on the reported device: the ladder's
 * last rung (`dprHalved`) takes `effectiveDpr` to 1, and halving THAT landed a
 * 195x422 buffer on a 1170x2532 panel.
 *
 * Nothing below DPR 2 moves. A DPR-1 display keeps 0.5 (the floor is
 * `max(0.5, 0.5) = 0.5`) and a DPR-2 display keeps 1 — so the
 * software-rasteriser floor's `dprMax 1` case and every desktop case are
 * byte-identical.
 */
export function degradedDpr(effectiveDpr: number, devicePixelRatio = 1): number {
  const floor = Math.max(MIN_DEGRADED_DPR, devicePixelRatio * DEGRADE_FLOOR_OF_DEVICE)
  return Math.min(effectiveDpr, Math.max(floor, effectiveDpr * 0.5))
}

/** Should the renderer be running at the degraded DPR right now? */
export function shouldDegradeDpr(i: DegradeInputs): boolean {
  if (!i.postprocessing || i.recording) return false
  // Nothing to shed: the floors already put the degraded ratio at (or above)
  // the effective one, so engaging would resize the buffer for no saving — and
  // every resize costs a clear + a synchronous repaint (GPU-STARVE-3).
  if (degradedDpr(i.effectiveDpr, i.devicePixelRatio ?? 1) >= i.effectiveDpr) return false
  if (i.gestureActive) return true
  if (i.gestureEndedAt > 0 && i.now - i.gestureEndedAt < RELEASE_DEBOUNCE_MS) return true
  if (
    i.lastLongFrameAt > 0 &&
    i.now - i.lastLongFrameAt < longFrameHoldMs(i.coarsePointer === true)
  )
    return true
  return false
}

// ---------------------------------------------------------------------------
// Long-frame bookkeeping (module singleton, written from useFrame).

let lastLongFrameAt = 0
let prevFrameDriven = false
let prevFrameLong = false

/**
 * Record a rendered frame's delta. Only deltas measured while frames are being
 * continuously driven (a camera gesture, or the RenderPump's continuous mode)
 * are trusted — in demand mode an idle gap between two single frames can be
 * seconds long without any frame being slow.
 *
 * The PREVIOUS frame must have been driven too (GPU-STARVE-3): the first frame
 * of a gesture measures its delta against the last idle demand-mode frame, so
 * `dt` spans the whole idle gap — trusting it recorded a phantom long frame at
 * the start of nearly every gesture, which held the degrade (and its resolution
 * toggle) for 3 s past every release. A genuinely slow first frame is still
 * caught one frame later, and the gesture itself already degrades immediately.
 */
export function noteRenderedFrame(
  dtMs: number,
  continuouslyDriven: boolean,
  nowMs: number,
  /** MOBILE-POLISH: on a coarse-pointer device require TWO consecutive long
   *  frames before arming the hold. One 250 ms frame on a phone is routinely the
   *  degrade's own buffer resize, a shader compile or a texture upload — a
   *  one-off that does not predict the next frame, and arming on it is what made
   *  the hold self-sustaining (see {@link LONG_FRAME_HOLD_COARSE_MS}). Two in a
   *  row is a scene that is genuinely too expensive, which is what the hold is
   *  for. Desktop is unchanged: there the watchdog reset costs the whole context
   *  and one spike is worth acting on. */
  coarsePointer = false,
): void {
  const trusted = continuouslyDriven && prevFrameDriven
  prevFrameDriven = continuouslyDriven
  const long = trusted && dtMs > LONG_FRAME_MS
  if (long && (!coarsePointer || prevFrameLong)) lastLongFrameAt = nowMs
  prevFrameLong = long
}

export function lastLongFrameTime(): number {
  return lastLongFrameAt
}

/** Test-only reset. */
export function __resetInteractiveDegrade(): void {
  lastLongFrameAt = 0
  prevFrameDriven = false
  prevFrameLong = false
}
