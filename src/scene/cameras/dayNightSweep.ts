/**
 * Day → night time-of-day sweep for the recorded walkthrough clip
 * (DAY-NIGHT-CLIP). While the saved-views cinematic tour plays for a video
 * clip, the time-of-day slider can be animated across a chosen range so the
 * exported video shows the room transitioning through lighting conditions
 * (competitor grounding: Coohom's day-to-night video renders — see
 * REFERENCES.md).
 *
 * Pure interpolation only — no three.js / store import — so it unit-tests
 * headlessly. `OrbitCamera` drives it from the live tour progress; the
 * `timeSlice` holds the config + the begin/apply/restore lifecycle.
 */

/** Clamp a value into [0, 1]. */
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Wrap any real number into [0, 24) (negatives wrap backwards, ≥24 modulo). */
function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24
}

/** Default sweep range — bright mid-morning daylight → night. */
export const DEFAULT_CLIP_START_HOUR = 8
export const DEFAULT_CLIP_END_HOUR = 22

/**
 * Fractional hour at clip `progress` (0 → 1) for a sweep from `startHour` to
 * `endHour`. The sweep always advances FORWARD through the day: when the end
 * hour is at or before the start (e.g. 20 → 6, an evening→dawn wrap), the end
 * is lifted by 24 h so the clock moves 20 → 21 → … → 0 → … → 6 rather than
 * rewinding backwards. Progress is clamped so an over-run frame can't push the
 * hour past the endpoint. Result is wrapped into [0, 24).
 */
export function sweepHourAt(progress: number, startHour: number, endHour: number): number {
  const p = clamp01(progress)
  let end = endHour
  if (end <= startHour) end += 24
  return wrapHour(startHour + (end - startHour) * p)
}
