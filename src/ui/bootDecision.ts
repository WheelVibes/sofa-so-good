/**
 * Boot-decision logic for the first-run experience.
 *
 * On a clean profile the onboarding carousel fires FIRST. The product tour
 * fires ONLY if the user explicitly selects it from the carousel's choice step.
 *
 * Extracted as a pure module so the decision can be unit-tested independently
 * of App.tsx's React lifecycle.
 *
 * Decision table:
 *   hdb_onboarded   result
 *   unset           open carousel  (clean profile — new user)
 *   '1'             nothing        (returning user — already onboarded)
 *
 * Note: hdb_tour_done alone (tour seen but carousel not yet seen) also maps to
 * carousel so users who were previously onboarded via the old tour-first path
 * still complete the carousel.  Once hdb_onboarded is set, both flags are
 * effectively "done" and no first-run surface fires.
 *
 * Mobile exception: the product tour spotlights desktop-only toolbar controls
 * and cannot work on mobile.  The carousel is always the first-run surface;
 * the tour choice card is hidden on mobile (ProductTour self-disables too).
 */

import { hasOnboarded } from './Onboarding'

export type BootDecision = 'carousel' | 'nothing'

/**
 * Decide what first-run surface to show at boot.
 *
 * All parameters are injectable so the function is unit-testable without
 * touching localStorage.
 *
 * @param opts.onboarded  Override for hasOnboarded() (localStorage read).
 */
export function resolveBootDecision(opts?: { onboarded?: boolean }): BootDecision {
  const onboarded = opts?.onboarded ?? hasOnboarded()
  return onboarded ? 'nothing' : 'carousel'
}
