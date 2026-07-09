import { useStore } from '../../state/store'
import { computeSun, hoursToDate, type SunPosition } from './sunPosition'
import { useEffectiveHour } from './useEffectiveHour'

/** Used when the user hasn't set a location and the prompt was skipped. */
export const FALLBACK_LOCATION = { lat: 1.35, lon: 103.82 } as const

// PERF-MAX-3: EIGHT lighting components (Lighting, EffectsImpl, SceneEnvironment,
// FurnitureLights, Sky, SceneBackdrop, LuxOverlay + the room-editor mirrors) each
// call this hook. Without a memo every render of each recomputes `SunCalc.getPosition`
// and allocates a fresh `Date` + result object for byte-identical inputs (the hour +
// location are global). A size-1 module cache keyed on the resolved instant + location
// collapses those to one computation per (minute, location) AND returns a STABLE object
// reference, so downstream `useMemo`/effect deps that key on the sun object (e.g.
// `Lighting`'s `targetVals`) stop invalidating every render. Pure win — same values.
let sunCache: { key: string; pos: SunPosition } | null = null

/** Test-only: clear the memo so a fresh render recomputes. */
export function __resetSunCacheForTest(): void {
  sunCache = null
}

/** Resolve the "effective" sun position from the current effective hour and the
 *  user's location (or the Singapore fallback). The hour runs on the viewer's
 *  local clock and `computeSun` evaluates it for the location's lat/lon + today's
 *  date, so sunrise/midday/sunset are the real times for that place (e.g. a
 *  Singapore evening stays lit until ~19:10). Re-runs every render of its caller —
 *  `useEffectiveHour` controls cadence (60s in system mode; on demand in manual) —
 *  but the memo below makes redundant calls with unchanged inputs a cache hit. */
export function useSunPosition(): SunPosition {
  const hour = useEffectiveHour()
  const location = useStore((s) => s.location) ?? FALLBACK_LOCATION
  const date = hoursToDate(hour)
  const key = `${date.getTime()}|${location.lat}|${location.lon}`
  if (sunCache && sunCache.key === key) return sunCache.pos
  const pos = computeSun(date, location.lat, location.lon)
  sunCache = { key, pos }
  return pos
}
