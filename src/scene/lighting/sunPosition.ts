import SunCalc from 'suncalc'

/** Solar position in radians.
 *  - `azimuth` follows SunCalc convention: 0 = south, +π/2 = west, −π/2 = east.
 *  - `altitude` is angle above horizon. Negative = sun below horizon. */
export interface SunPosition {
  azimuth: number
  altitude: number
}

export function computeSun(date: Date, lat: number, lon: number): SunPosition {
  const { azimuth, altitude } = SunCalc.getPosition(date, lat, lon)
  return { azimuth, altitude }
}

/** Convert a sun position to a scene-space unit vector.
 *
 *  Scene coordinate system: +X east, +Y up, +Z south. SunCalc azimuth:
 *  0 = south, positive = westward, negative = eastward. */
export function sunDirectionToScene(s: SunPosition): [number, number, number] {
  const cosAlt = Math.cos(s.altitude)
  const x = -Math.sin(s.azimuth) * cosAlt
  const y = Math.sin(s.altitude)
  const z = Math.cos(s.azimuth) * cosAlt
  return [x, y, z]
}

/** Build a Date for the same calendar day as `today` but with the given
 *  fractional hour (local time). Used to translate the user's effective
 *  hour into a Date that SunCalc can consume. */
export function hoursToDate(hour: number, today: Date = new Date()): Date {
  const h = ((hour % 24) + 24) % 24
  const minutes = Math.round(h * 60)
  const result = new Date(today)
  result.setHours(0, minutes, 0, 0)
  return result
}

/** Build the absolute instant whose **local solar time at `lonDeg`** is `hour`.
 *
 *  The manual time slider means "show me the flat at 6pm *there*", but `computeSun`
 *  works on an absolute instant evaluated for the location's longitude. If we built
 *  the Date in the browser's timezone (`hoursToDate`), a browser whose zone doesn't
 *  match the location's longitude would map e.g. 18:00 to a night-time solar instant
 *  → a pitch-dark "6pm". Anchoring to the longitude (mean solar time: UTC = local −
 *  lon/15) makes the slider's hours intuitive everywhere — 18:00 is dusk, noon is
 *  overhead — independent of the viewer's clock. */
export function localSolarDate(hour: number, lonDeg: number, today: Date = new Date()): Date {
  const h = ((hour % 24) + 24) % 24
  const utcMinutes = Math.round((h - lonDeg / 15) * 60)
  const result = new Date(today)
  result.setUTCHours(0, utcMinutes, 0, 0)
  return result
}
