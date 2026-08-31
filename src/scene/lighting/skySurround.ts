/**
 * SKY-ANALYTIC-ORBIT — the ORBIT surround: an analytic sky with no ground.
 *
 * ## Why this exists rather than reusing `paintSkyEquirect`
 *
 * The dollhouse view renders the whole flat from above, so the camera looks DOWN
 * and most of the visible background lies BELOW the horizon. `skyRadiance` returns
 * a ground tint there (`groundAlbedo`, default [0.32, 0.30, 0.28]), which is right
 * for the walk-mode WINDOW view it was written for — a window looks out over real
 * ground, a dollhouse does not — and wrong here: reusing it directly put the flat
 * on a dull brown-grey (sampled 175/165/152, warm r>g>b) — measurably worse than
 * the white it replaced, and reverted.
 *
 * (SKY-HORIZON, v0.31.5.97, narrows that: HAVING ground in the window view is
 * right, but the bare tint was not. It met the sky at a hard 62-luma step across
 * one degree, so it now fades out of the horizon haze — see `skyGradient.ts`. The
 * dollhouse still gets no ground at all.)
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
  horizonSampleDir,
  normalize,
  type SkyParams,
  skyRadiance,
  smoothstep,
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

/** Re-exported so this module's own consumers/tests keep one import site. The
 *  constant itself now lives beside `skyRadiance`, because the walk-mode window
 *  backdrop needs the SAME near-horizon sample for its aerial-perspective haze
 *  (SKY-HORIZON) — two copies of this hard-won number would be two things to get
 *  wrong. */
export { HORIZON_EPS } from './skyGradient'

/**
 * Sky radiance for the SURROUND: the analytic sky above the horizon, and a dimmed
 * continuation of the horizon below it (never a ground tint).
 */
export function surroundRadiance(view: Vec3, params: SurroundParams): Vec3 {
  const v = normalize(view)
  if (v[1] >= 0) return skyRadiance(v, params)
  // Below the horizon: sample the sky just ABOVE the horizon at THIS AZIMUTH, then
  // dim. `horizonSampleDir` carries the two traps this sample has to avoid (the
  // elevation drifting with tilt, and the nadir having no azimuth) — it is the
  // same helper the window backdrop's haze blend uses.
  const horizon = skyRadiance(horizonSampleDir(v), params)
  const dim = params.nadirDim ?? DEFAULT_NADIR_DIM
  const k = 1 - (1 - dim) * smoothstep(Math.min(1, -v[1]))
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
