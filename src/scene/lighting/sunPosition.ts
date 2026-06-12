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
 *  fractional hour in the **viewer's local clock**. The manual time slider runs
 *  on the local clock (so sunrise/sunset checkpoints from `daylightTimes` — which
 *  read the same clock — line up), and `computeSun` evaluates the resulting
 *  instant for the location's lat/lon. */
export function hoursToDate(hour: number, today: Date = new Date()): Date {
  const h = ((hour % 24) + 24) % 24
  const minutes = Math.round(h * 60)
  const result = new Date(today)
  result.setHours(0, minutes, 0, 0)
  return result
}
