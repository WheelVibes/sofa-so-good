/**
 * Pure slide-navigation logic for presentation mode (`PresentationMode.tsx`),
 * extracted so the wrap + auto-advance behaviour is unit-testable.
 */

/** Delay between slides when auto-advance is on. */
export const AUTO_ADVANCE_MS = 6000

/**
 * Delay before capturing a 360° slide's panorama: the saved view restores the
 * camera with an animated ~0.6 s fly (OrbitCamera), so the capture waits for
 * it to land (the capture itself then settles the wall-reveal fade on top).
 */
export const PANO_FLY_SETTLE_MS = 800

/** Wrap a slide index into [0, count). */
export function wrapIndex(next: number, count: number): number {
  if (count <= 0) return 0
  return ((next % count) + count) % count
}

/**
 * Whether the auto-advance timer should run for the current slide.
 *
 * Deliberate choice: auto-advance **pauses on a 360° slide** — the slide is an
 * interactive look-around (the user is exploring, possibly mid-drag), so
 * yanking it away on a timer would be hostile. The deck advances on
 * tap/Next/arrow keys only, and the timer resumes on the next regular slide.
 */
export function shouldAutoAdvance(opts: {
  presenting: boolean
  auto: boolean
  count: number
  isPanoSlide: boolean
}): boolean {
  return opts.presenting && opts.auto && opts.count > 0 && !opts.isPanoSlide
}
