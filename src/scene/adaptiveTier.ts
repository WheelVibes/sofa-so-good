/**
 * Bidirectional adaptive render tier (TIER-ADAPTIVE).
 *
 * ## Why this replaces hardware detection as the primary signal
 *
 * The app ships on Cloudflare Pages and runs in a browser on hardware it cannot
 * see. The obvious signal — `WEBGL_debug_renderer_info`'s unmasked renderer
 * string — is a fingerprinting surface and is going away: it is **deprecated in
 * Firefox and slated for removal**, disabled by `privacy.resistFingerprinting`,
 * blockable via `webgl.enable-debug-renderer-info`, farbled by Brave, and
 * deliberately generic on Safari (every Apple device reports "Apple GPU", so an
 * M-series desktop is indistinguishable from a phone). Building the quality
 * default on it means a large, growing share of real users get whatever the
 * fallback happens to be.
 *
 * Two measurements from the preceding rounds also show that hardware identity is
 * the wrong *kind* of signal even when available:
 *
 *  - The thing actually capping the post tiers was a mirror doing a full extra
 *    scene pass (`furniture/mirrorRelevance.ts`) — a CONTENT cost. No renderer
 *    string predicts that.
 *  - Frame cost barely tracked resolution: 7x the viewport pixels moved orbit
 *    FPS by ~9%, because those frames were never fill-bound. A "big display →
 *    lower tier" heuristic would have been confidently wrong too.
 *
 * So hardware detection is demoted to a cheap best-effort FLOOR/CEILING guard
 * (`quality.ts:capabilityCeilingTier` — keep phones and software rasterisers off
 * the shadow/post tiers) and the real decision is made by measuring frames.
 *
 * ## The signal is frame COST, not frame rate
 *
 * See `frameCost.ts` for the measurements. Briefly: this Canvas is
 * `frameloop="demand"`, so frame RATE reports how often the pump chose to draw,
 * not how fast the device can draw — 59.7 rAF/s against 30.5 actual renders,
 * each costing 5.7 ms. A rate-based guard reads that as a failure and demotes a
 * scene using a third of its budget, which is precisely what the first cut of
 * this ladder did. Rate is equally useless upward, because vsync clamps it: two
 * different tiers both report exactly 60.
 *
 * ## Why promotion is still a PROBE
 *
 * Cost tells us how much budget the CURRENT tier uses; it cannot tell us what
 * the NEXT one would cost, because the step between rungs is content-dependent
 * (a mirror or a transmissive window changes it far more than the tier preset
 * does). So promotion remains a bet informed by the measured step sizes — step
 * up, measure, step back if it doesn't hold. That makes oscillation the real
 * risk, so the anti-oscillation mechanism is a **learned ceiling**
 * (`autoMaxTier`) rather than a wider threshold: a tier that has failed on this
 * device is never retried, and the settled tier persists so repeat visits skip
 * the ramp entirely.
 *
 * Everything here is pure (no three, no React, no storage) so the ladder is
 * unit-testable.
 */

import type { CostWindow } from './frameCost'
import { DEVICE_CLASSES, type DeviceClass } from './quality'

/**
 * Budget for one displayed frame at 60 Hz. Everything below is expressed as a
 * fraction of this so the thresholds stay legible.
 */
export const FRAME_BUDGET_MS = 1000 / 60

/**
 * p90 render cost at or above which the current tier is FAILING and must come
 * down — ~84% of the 60 Hz budget. Not the full budget: the browser still has to
 * composite, run layout for the DOM overlays and service input, so a frame that
 * eats the whole budget in render alone is already dropping frames.
 */
export const DEMOTE_COST_MS = 14

/**
 * p90 render cost at or below which we probe the tier ABOVE — ~54% of budget.
 *
 * Calibrated against the measured step size between rungs on the reference
 * machine (p90): performance 4.7 → medium 6.0 (+28%), medium 6.0 → high 8.9
 * (+48%), high 8.9 → maximum 11.7 (+31%). A tier sitting at or under 9 ms can
 * absorb the worst of those steps and still land inside {@link DEMOTE_COST_MS},
 * so the probe is an informed bet rather than a coin flip.
 */
export const PROMOTE_COST_MS = 9

/** Consecutive bad sample windows before stepping DOWN. */
export const DEMOTE_WINDOWS = 2

/**
 * Consecutive good windows before stepping UP — deliberately slower than
 * demotion. Dropping quality is a correction the user wants immediately; raising
 * it is a gamble that costs them a visible stutter if it fails, so it should be
 * taken only on solid evidence.
 */
export const PROMOTE_WINDOWS = 4

/**
 * Fewest displayed frames a window must contain to be worth judging. In demand
 * mode a "window" can close having drawn two frames — far too little to trust a
 * p90, and a single expensive discrete edit (placing furniture, switching a
 * finish) would read as a sustained failure.
 */
export const MIN_WINDOW_FRAMES = 20

/**
 * Wall-clock frame interval that counts as failing, ms.
 *
 * 33.3 ms is the 30 fps floor the tier ladder is documented against —
 * `tier-fps.mjs`: "an auto-selected tier is only defensible if it holds the 30fps
 * floor on the hardware it is selected for". Sustained frames at or past this are
 * a demotion regardless of how cheaply they submitted.
 */
export const DEMOTE_INTERVAL_MS = 1000 / 30

/**
 * Wall-clock interval a window must beat to count as evidence for PROMOTION.
 *
 * 20 ms (50 fps) leaves a hysteresis band against {@link DEMOTE_INTERVAL_MS}, the
 * same shape the submit-cost pair already has — without it the ladder could
 * promote at 31 fps and demote at 29 fps forever.
 */
export const PROMOTE_INTERVAL_MS = 20

export interface AutoDeviceState {
  /** The device class currently active — which variant of the mode is rendering. */
  device: DeviceClass
  /**
   * The learned ceiling: the highest device class auto-adjust may reach on THIS
   * machine, set when one FAILS. `null` = nothing learned yet.
   *
   * NOT "the highest class reached" — see the promotion branch of
   * {@link decideAutoDevice} for why conflating the two breaks the ladder. Boot
   * memory is the ordinary persisted value.
   */
  autoMaxDevice: DeviceClass | null
  /**
   * THE LAST RUNG: halve the device pixel ratio to 1 when the class ladder has bottomed out and
   * frames are still slow. `(z)`7.
   *
   * **Why it is needed at all.** `realistic` carries `dprMax: 2` at BOTH device classes, so
   * demoting `capable -> weak` changes shadows and post but not one pixel of resolution — which is
   * why `v0.31.7.86` measured the chain recovering to **29.6 fps** and stopping there, right on the
   * 30 fps floor with nothing left to give. `dprMax` 2 -> 1 is the largest lever measured in this
   * arc: **4.5x (10.9 -> 49.6 fps)**, more than shadows, post and transmission combined.
   *
   * **Last down, first up**, which the ordering in {@link decideAutoDevice} enforces: resolution is
   * the most visible thing to sacrifice, so nothing else should still be available when it goes,
   * and it should come back before the class ladder starts climbing again.
   */
  dprHalved: boolean
}

const index = (d: DeviceClass): number => DEVICE_CLASSES.indexOf(d)

/** The lower of two device classes (by the canonical `DEVICE_CLASSES` ordering). */
export function minDevice(a: DeviceClass, b: DeviceClass): DeviceClass {
  return index(a) <= index(b) ? a : b
}

/** Step one class up/down, clamped to the ends of the ladder. */
function step(d: DeviceClass, dir: 1 | -1): DeviceClass {
  const i = index(d)
  if (i < 0) return d
  return DEVICE_CLASSES[Math.min(DEVICE_CLASSES.length - 1, Math.max(0, i + dir))]
}

/**
 * The effective ceiling: never above what capability detection allows, and never
 * above a class this machine has already failed at.
 *
 * The old third clamp — a hardcoded promote ceiling that kept the ladder out of
 * `maximum` — is gone with the rung. Reaching the cinematic settings is now the
 * user picking `realistic`, which is an explicit choice by construction, so there
 * is nothing left for the ladder to withhold.
 */
export function effectiveCeiling(
  detected: DeviceClass,
  autoMaxDevice: DeviceClass | null,
): DeviceClass {
  return autoMaxDevice ? minDevice(detected, autoMaxDevice) : detected
}

/**
 * One rung of the adaptive ladder. Returns the new state, or `null` to hold.
 *
 * `goodWindows`/`badWindows` are consecutive-sample-window counters the caller
 * maintains; it should reset them whenever this returns non-null, since the
 * evidence has been spent.
 *
 * Demotion is checked FIRST: a tier that is failing right now must come down
 * even if it also accumulated good windows earlier.
 */
export function decideAutoDevice(
  state: AutoDeviceState,
  detected: DeviceClass,
  goodWindows: number,
  badWindows: number,
  /** Has the sun-shadow fallback already been used? Gates the dpr rung — see below. */
  shadowsShed = false,
): AutoDeviceState | null {
  const { device, autoMaxDevice } = state
  const lowest = DEVICE_CLASSES[0]

  if (badWindows >= DEMOTE_WINDOWS && device !== lowest) {
    const down = step(device, -1)
    // Record the failure as the new ceiling so the ladder never climbs back into
    // it — this, not a bigger threshold, is what stops oscillation.
    return { device: down, autoMaxDevice: down, dprHalved: state.dprHalved }
  }

  // THE LAST RUNG, and it must genuinely be last. `shadowsShed` is required because halving the
  // resolution is MORE visible than dropping the sun-shadow pass: without this gate the ladder
  // would spend resolution first and only then try shadows, since a state change here returns
  // early and the controller's shadow fallback never runs on that tick.
  if (badWindows >= DEMOTE_WINDOWS && device === lowest && shadowsShed && !state.dprHalved) {
    return { ...state, dprHalved: true }
  }

  // RESOLUTION RETURNS FIRST, before the class ladder climbs. A promotion that restored shadows
  // and post while leaving the frame at half resolution would spend the recovered headroom on the
  // least visible thing available.
  if (goodWindows >= PROMOTE_WINDOWS && state.dprHalved) {
    return { ...state, dprHalved: false }
  }

  const ceiling = effectiveCeiling(detected, autoMaxDevice)
  if (goodWindows >= PROMOTE_WINDOWS && index(device) < index(ceiling)) {
    // `autoMaxDevice` is deliberately UNTOUCHED on the way up. It means "the
    // class that FAILED here", not "the highest class reached" — conflating the
    // two makes every successful promotion cap the ladder where it just arrived.
    // Boot memory is a separate concern: the settled value is persisted by
    // `qualityPrefs`.
    return { device: step(device, 1), autoMaxDevice, dprHalved: state.dprHalved }
  }

  return null
}

/**
 * Classify one measured sample window by its p90 frame cost.
 *
 * A window with too few frames — or no data at all — is `neutral`: it is not
 * evidence in either direction, and (unlike the fps guard this replaced) must
 * never be mistaken for a failure.
 */
export function classifyWindow(window: CostWindow): 'good' | 'bad' | 'neutral' {
  if (window.n < MIN_WINDOW_FRAMES) return 'neutral'
  if (!Number.isFinite(window.p90) || window.p90 < 0) return 'neutral'
  // WALL CLOCK FIRST. Submit time cannot see a GPU-bound frame: `v0.31.7.84`
  // measured 10.9 fps (92 ms/frame) at a 6.9 ms submit p90, i.e. "cheap" by this
  // function's original standard while missing the frame-rate floor by 3x. A
  // window that is slow on the wall is bad however fast it submitted.
  const wall = window.intervalP90
  if (Number.isFinite(wall) && wall >= DEMOTE_INTERVAL_MS) return 'bad'
  if (window.p90 >= DEMOTE_COST_MS) return 'bad'
  // Promotion still requires BOTH to be comfortable. Climbing on a cheap submit
  // while the wall clock is mediocre is how the ladder would oscillate into the
  // configuration it just left.
  if (window.p90 <= PROMOTE_COST_MS) {
    if (!Number.isFinite(wall) || wall < 0) return 'good'
    return wall <= PROMOTE_INTERVAL_MS ? 'good' : 'neutral'
  }
  return 'neutral'
}
