import { useStore } from '../../state/store'
import { computeSun, hoursToDate, type SunPosition } from './sunPosition'
import { useEffectiveHour } from './useEffectiveHour'

/** Used when the user hasn't set a location and the prompt was skipped. */
export const FALLBACK_LOCATION = { lat: 1.35, lon: 103.82 } as const

/** Resolve the "effective" sun position from the current effective hour and the
 *  user's location (or the Singapore fallback). The hour runs on the viewer's
 *  local clock and `computeSun` evaluates it for the location's lat/lon + today's
 *  date, so sunrise/midday/sunset are the real times for that place (e.g. a
 *  Singapore evening stays lit until ~19:10). Re-runs every render of its caller —
 *  `useEffectiveHour` controls cadence (60s in system mode; on demand in manual). */
export function useSunPosition(): SunPosition {
  const hour = useEffectiveHour()
  const location = useStore((s) => s.location) ?? FALLBACK_LOCATION
  const date = hoursToDate(hour)
  return computeSun(date, location.lat, location.lon)
}
