/**
 * Cinematic tour through the user's SAVED VIEWS (V-TOUR) — the authored
 * counterpart of the auto room tour: the camera flies each saved view in
 * order with smooth easing, applying each view's captured lighting as its
 * leg begins (so a dusk view plays at dusk). Pure frame-building here;
 * OrbitCamera drives the animation. Competitor grounding: Coohom's video
 * walkthrough / cinematic tour renders (see REFERENCES.md).
 */

import type { SavedView } from '../../state/slices/cameraViewsSlice'

export interface ViewTourFrame {
  pos: [number, number, number]
  target: [number, number, number]
  /** Captured lighting to apply when this leg starts (absent = leave as-is). */
  lights?: SavedView['lights']
  mode?: SavedView['mode']
  hour?: number
}

/** Frames for a saved-view tour, in saved order. Views with malformed poses
 *  are skipped; fewer than 2 usable frames → null (nothing to tour). */
export function viewTourFrames(views: readonly SavedView[]): ViewTourFrame[] | null {
  const ok = views.filter(
    (v) =>
      Array.isArray(v.pos) &&
      v.pos.length === 3 &&
      v.pos.every(Number.isFinite) &&
      Array.isArray(v.target) &&
      v.target.length === 3 &&
      v.target.every(Number.isFinite),
  )
  if (ok.length < 2) return null
  return ok.map((v) => ({
    pos: v.pos,
    target: v.target,
    lights: v.lights,
    mode: v.mode,
    hour: v.hour,
  }))
}

/** Seconds per leg — slower than the room tour (these are presentation shots). */
export const VIEW_TOUR_LEG_SECONDS = 3.5
