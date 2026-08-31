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
import { RENDER_TIERS, type RenderTier } from './quality'

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
 * Highest tier auto-adjust will ever reach on its own. `maximum` is cinematic
 * (full-res AO, film grain, 4096² shadows) and stays a deliberate user choice —
 * it measures 11.7 ms p90 here, i.e. it *would* pass the probe, which is exactly
 * why it needs an explicit ceiling rather than being left to the ladder.
 */
export const AUTO_PROMOTE_CEILING: RenderTier = 'high'

export interface AutoTierState {
  /** The tier currently active. */
  tier: RenderTier
  /**
   * The learned ceiling: the highest tier auto-adjust may reach on THIS device,
   * set when a rung FAILS. `null` = nothing learned yet, so the ladder may probe
   * up to {@link AUTO_PROMOTE_CEILING}.
   *
   * NOT "the highest tier reached" — see the promotion branch of
   * {@link decideAutoTier} for why conflating the two breaks the ladder. Boot
   * memory is the ordinary persisted `tier`.
   */
  autoMaxTier: RenderTier | null
}

const index = (t: RenderTier): number => RENDER_TIERS.indexOf(t)

/** The lower of two tiers (by the canonical `RENDER_TIERS` ordering). */
export function minTier(a: RenderTier, b: RenderTier): RenderTier {
  return index(a) <= index(b) ? a : b
}

/** Step one tier up/down, clamped to the ends of the ladder. */
function step(t: RenderTier, dir: 1 | -1): RenderTier {
  const i = index(t)
  if (i < 0) return t
  return RENDER_TIERS[Math.min(RENDER_TIERS.length - 1, Math.max(0, i + dir))]
}

/**
 * The effective ceiling for a device: never above {@link AUTO_PROMOTE_CEILING},
 * never above what the capability guard allows, and never above a tier this
 * device has already failed at.
 */
export function effectiveCeiling(
  capabilityCeiling: RenderTier,
  autoMaxTier: RenderTier | null,
): RenderTier {
  const hard = minTier(AUTO_PROMOTE_CEILING, capabilityCeiling)
  return autoMaxTier ? minTier(hard, autoMaxTier) : hard
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
export function decideAutoTier(
  state: AutoTierState,
  capabilityCeiling: RenderTier,
  goodWindows: number,
  badWindows: number,
): AutoTierState | null {
  const { tier, autoMaxTier } = state
  const lowest = RENDER_TIERS[0]

  if (badWindows >= DEMOTE_WINDOWS && tier !== lowest) {
    const down = step(tier, -1)
    // Record the failure as the new ceiling so the ladder never climbs back into
    // it — this, not a bigger threshold, is what stops oscillation.
    return { tier: down, autoMaxTier: down }
  }

  const ceiling = effectiveCeiling(capabilityCeiling, autoMaxTier)
  if (goodWindows >= PROMOTE_WINDOWS && index(tier) < index(ceiling)) {
    // `autoMaxTier` is deliberately UNTOUCHED on the way up. It means "the rung
    // that FAILED here", not "the highest rung reached" — conflating the two
    // makes every successful promotion cap the ladder at the rung it just
    // reached, so `performance` could climb to `medium` and then never to
    // `high`. Boot memory is a separate concern: the settled tier is already
    // persisted by `qualityPrefs` as the ordinary `tier` value.
    return { tier: step(tier, 1), autoMaxTier }
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
  if (window.p90 >= DEMOTE_COST_MS) return 'bad'
  if (window.p90 <= PROMOTE_COST_MS) return 'good'
  return 'neutral'
}
