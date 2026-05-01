import SunCalc from 'suncalc';

/** Solar position in radians.
 *  - `azimuth` follows SunCalc convention: 0 = south, +π/2 = west, −π/2 = east.
 *  - `altitude` is angle above horizon. Negative = sun below horizon. */
export interface SunPosition {
  azimuth: number;
  altitude: number;
}

export function computeSun(date: Date, lat: number, lon: number): SunPosition {
  const { azimuth, altitude } = SunCalc.getPosition(date, lat, lon);
  return { azimuth, altitude };
}

/** Convert a sun position to a scene-space unit vector.
 *
 *  Scene coordinate system: +X east, +Y up, +Z south. SunCalc azimuth:
 *  0 = south, positive = westward, negative = eastward. */
export function sunDirectionToScene(s: SunPosition): [number, number, number] {
  const cosAlt = Math.cos(s.altitude);
  const x = -Math.sin(s.azimuth) * cosAlt;
  const y = Math.sin(s.altitude);
  const z = Math.cos(s.azimuth) * cosAlt;
  return [x, y, z];
}

/** Rotate a 3-vector clockwise around Y when viewed from above (compass
 *  bearings: N=0° → E=90° → S=180° → W=270°). Used to apply the user's
 *  apartment orientation to sun positions and directions. */
export function rotateAroundY(
  v: readonly [number, number, number],
  deg: number,
): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
}

/** Build a Date for the same calendar day as `today` but with the given
 *  fractional hour (local time). Used to translate the user's effective
 *  hour into a Date that SunCalc can consume. */
export function hoursToDate(hour: number, today: Date = new Date()): Date {
  const h = ((hour % 24) + 24) % 24;
  const minutes = Math.round(h * 60);
  const result = new Date(today);
  result.setHours(0, minutes, 0, 0);
  return result;
}
