/**
 * Pure slide-navigation logic for presentation mode (`PresentationMode.tsx`),
 * extracted so the wrap + auto-advance behaviour is unit-testable.
 */

import type { SavedView } from '../../state/slices/cameraViewsSlice'
import type { PanoTourStop } from '../panorama/panoTour'

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

// ---------------------------------------------------------------------------
// Tour-slide composition (P-720 tail / C266)
// ---------------------------------------------------------------------------

/** A view slide: the existing saved camera view, shown as before. */
export interface ViewSlide {
  kind: 'view'
  view: SavedView
}

/**
 * A tour-stop slide: a panorama captured from a stop's eye position, using the
 * same `capturePanorama({eye})` + `panoImageIdb` cache path as PanoTourModal.
 * `levelId` is absent for ground-floor stops.
 */
export interface TourStopSlide {
  kind: 'tourStop'
  stop: PanoTourStop
}

/** Unified slide discriminated union for the composed slide deck. */
export type Slide = ViewSlide | TourStopSlide

/**
 * Compose the full slide deck from saved views and optional tour stops.
 *
 * Behaviour:
 * - Views always come first (in saved-views order).
 * - When `includeTour` is true, tour stops are appended in order *after* the
 *   views — each stop becomes a `TourStopSlide` (always a panorama slide).
 * - Stops on a *different storey* (`stop.levelId !== currentLevelId`) are
 *   **skipped** when `currentLevelId` is a real storey id (not `undefined` /
 *   `'all'` / `undefined` ground floor).  Pass `undefined` or `'all'` to
 *   include every stop regardless of storey.
 * - An empty `stops` array with `includeTour: true` produces no additional
 *   slides (no-op); the views-only deck is returned unchanged.
 *
 * @param views - The full saved-views list.
 * @param stops - All tour stops from the store.
 * @param includeTour - Whether to append tour stops after the views.
 * @param currentLevelId - Active storey filter (`undefined`/`'all'` = no filter).
 */
export function composeTourSlides(
  views: SavedView[],
  stops: PanoTourStop[],
  includeTour: boolean,
  currentLevelId?: string,
): Slide[] {
  const viewSlides: ViewSlide[] = views.map((v) => ({ kind: 'view', view: v }))
  if (!includeTour || stops.length === 0) return viewSlides

  const filter = currentLevelId && currentLevelId !== 'all' ? currentLevelId : undefined
  const stopSlides: TourStopSlide[] = stops
    .filter((s) => {
      if (!filter) return true
      // Ground-floor stops have no levelId; upper-storey stops carry one.
      // When filtering by a specific upper level, include only stops for that
      // level. Ground-level view (no filter / filter undefined) includes all stops.
      return (s.levelId ?? undefined) === filter
    })
    .map((s) => ({ kind: 'tourStop' as const, stop: s }))

  return [...viewSlides, ...stopSlides]
}
