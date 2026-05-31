import { useStore } from '../../state/store'
import { computeSun, hoursToDate, type SunPosition } from './sunPosition'
import { useEffectiveHour } from './useEffectiveHour'

/** Used when the user hasn't set a location and the prompt was skipped. */
export const FALLBACK_LOCATION = { lat: 1.35, lon: 103.82 } as const

/** Resolve the "effective" sun position from the current effective
 *  hour and the user's location (or the Singapore fallback). Re-runs
 *  every render of its caller — the underlying `useEffectiveHour`
 *  controls cadence (60s in system mode; on demand in manual). */
export function useSunPosition(): SunPosition {
  const hour = useEffectiveHour()
  const location = useStore((s) => s.location) ?? FALLBACK_LOCATION
  const date = hoursToDate(hour)
  return computeSun(date, location.lat, location.lon)
}
