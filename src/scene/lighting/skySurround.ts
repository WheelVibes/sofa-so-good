/**
 * SKY-ANALYTIC-ORBIT — the ORBIT surround: an analytic sky with no ground.
 *
 * ## Why this exists rather than reusing `paintSkyEquirect`
 *
 * The dollhouse view renders the whole flat from above, so the camera looks DOWN
 * and most of the visible background lies BELOW the horizon. `skyRadiance` returns
 * a brown ground tint there (`groundAlbedo`, default [0.32, 0.30, 0.28]), which is
 * right for the walk-mode WINDOW view it was written for and wrong here: reusing it
 * directly put the flat on a dull brown-grey (sampled 175/165/152, warm r>g>b) —
 * measurably worse than the white it replaced, and reverted.
 *
 * So the lower hemisphere instead CONTINUES the sky: it samples the horizon colour
 * at the same azimuth and dims it toward the nadir, giving a soft infinite haze with
 * no visible ground line. That is also what a product dollhouse render conventionally
 * sits on.
 *
 * ## Why not the drei `<Sky>` dome it replaces
 *
 * That dome emits near-white in this app's exposure range: zenith HSV saturation
 * **0.017** at 13:00, indistinguishable from its own horizon (0.021), and never above
 * 0.03 at ANY hour. Five causes were tested and rejected — the tone curve (washed out
 * under filmic 0.008 / AgX 0.017 / Neutral 0.073 alike), the scattering parameters
 * (raising `rayleigh` 1 → 10 makes it WORSE, 0.017 → 0.000, since more scattering
 * means more radiance and it climbs further up the operator's shoulder), the global
 * exposure (a 4x cut lifts saturation only to 0.041 — clipped blue would have been
 * revealed by dimming), the sun angle, and the equirect reuse above.
 * `skyGradient.ts` has no such problem because it is deliberately normalised to an
 * LDR 0..~1 range rather than absolute luminance: sampled headlessly it gives zenith
 * saturation 0.54–0.68, a pale horizon (0.09–0.23) and a warm low-sun horizon (0.63).
 *
 * Pure — no three, no canvas — so the maths is unit-testable headlessly, matching
 * `skyGradient.ts` / `backdropHorizon.ts`.
 */
import {
  encodeByte,
  equirectDir,
  normalize,
  type SkyParams,
  skyRadiance,
  type Vec3,
} from './skyGradient'

export interface SurroundParams extends SkyParams {
  /**
   * How far the nadir is dimmed relative to the horizon (0..1, 1 = no dimming).
   * A little dimming reads as aerial haze and keeps the model's silhouette legible
   * against the background; too much reintroduces the dark "ground" the whole point
   * was to remove.
   */
  nadirDim?: number
}

export const DEFAULT_NADIR_DIM = 0.72

/**
 * Elevation (sin of altitude) at which the horizon colour is sampled for the lower
 * hemisphere. NOT vanishingly small on purpose: the Perez formula divides by
 * `cos(view zenith)` and `skyRadiance` clamps that to 1e-4, so sampling right at
 * the horizon lands in the singular region where the value swings steeply — two
 * samples 0.001 apart came out a factor of 1.5 different. ~1.1 degrees up is a
 * genuine near-horizon sky colour and is numerically stable.
 */
export const HORIZON_EPS = 0.02

/** Smoothstep, so the horizon has no visible seam or Mach band. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Sky radiance for the SURROUND: the analytic sky above the horizon, and a dimmed
 * continuation of the horizon below it (never a ground tint).
 */
export function surroundRadiance(view: Vec3, params: SurroundParams): Vec3 {
  const v = normalize(view)
  if (v[1] >= 0) return skyRadiance(v, params)
  // Below the horizon: sample the sky just ABOVE the horizon at THIS AZIMUTH, then
  // dim. The horizontal part is renormalised first so the sample sits at exactly
  // `HORIZON_EPS` elevation for every view direction — passing `[v.x, EPS, v.z]`
  // straight through does NOT, because `v` is a unit vector whose horizontal length
  // shrinks as it tilts, so the effective elevation drifts (0.020 looking level,
  // 0.022 at 30 degrees down) and lands back in Perez's steep near-horizon region.
  // That alone made the surround read BRIGHTER halfway down than just below the
  // horizon, i.e. non-monotonic.
  const hLen = Math.hypot(v[0], v[2])
  const flat = Math.sqrt(Math.max(0, 1 - HORIZON_EPS * HORIZON_EPS))
  // Straight down has NO azimuth (hLen = 0). A `|| 1` fallback there collapses the
  // sample to [0, EPS, 0] — the ZENITH, the brightest part of the sky — so the
  // underside came out BRIGHTER than the horizon (0.552 against 0.370), i.e.
  // non-monotonic exactly where the surround should be dimmest. Pick an arbitrary
  // valid azimuth instead; all azimuths converge at the pole anyway.
  const ax = hLen > 1e-6 ? v[0] / hLen : 1
  const az = hLen > 1e-6 ? v[2] / hLen : 0
  const horizon = skyRadiance([ax * flat, HORIZON_EPS, az * flat], params)
  const dim = params.nadirDim ?? DEFAULT_NADIR_DIM
  const k = 1 - (1 - dim) * smooth(Math.min(1, -v[1]))
  return [horizon[0] * k, horizon[1] * k, horizon[2] * k]
}

/**
 * Paint the surround into an equirect RGBA byte buffer (`buf` length = w*h*4).
 * Pure — the adapter copies it into an ImageData / CanvasTexture.
 */
export function paintSkySurround(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  params: SurroundParams,
): void {
  let i = 0
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const rgb = surroundRadiance(equirectDir(col, row, w, h), params)
      buf[i] = encodeByte(rgb[0])
      buf[i + 1] = encodeByte(rgb[1])
      buf[i + 2] = encodeByte(rgb[2])
      buf[i + 3] = 255
      i += 4
    }
  }
}
