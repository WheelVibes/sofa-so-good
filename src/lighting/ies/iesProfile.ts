/**
 * Derived photometric metrics from a parsed {@link IesProfile} — pure, render-
 * agnostic. These collapse the candela distribution down to the few numbers a
 * real-time renderer needs: peak intensity, the beam angle (to 50 % of peak),
 * and the field angle (to 10 % of peak).
 *
 * Convention: angles are measured from **nadir** (straight down, the 0° vertical
 * angle in a type-C downlight goniometer). For a symmetric downlight we look at
 * the principal vertical plane and find where intensity drops to a fraction of
 * peak, interpolating linearly between sampled angles.
 */

import type { IesProfile } from './parseIes'

export interface IesMetrics {
  /** Peak candela across the whole distribution. */
  peakCandela: number
  /** Vertical angle (deg from nadir) at which peak occurs. */
  peakAngle: number
  /** Beam angle (full, deg): where intensity falls to 50 % of peak. */
  beamAngle: number
  /** Field angle (full, deg): where intensity falls to 10 % of peak. */
  fieldAngle: number
}

/** The vertical-plane candela slice to analyse: the row whose values are largest
 *  (the principal plane), averaged is overkill for our use — pick the strongest. */
function principalSlice(profile: IesProfile): { angles: number[]; values: number[] } {
  const { verticalAngles, candela } = profile
  let bestRow = 0
  let bestMax = Number.NEGATIVE_INFINITY
  for (let h = 0; h < candela.length; h++) {
    const m = Math.max(...candela[h])
    if (m > bestMax) {
      bestMax = m
      bestRow = h
    }
  }
  return { angles: verticalAngles, values: candela[bestRow] ?? [] }
}

/** Interpolate the angle at which `values` first drops to `target`, scanning
 *  outward from the peak. Returns the last sampled angle if it never drops that
 *  low (a very wide distribution). */
function angleAtFraction(
  angles: number[],
  values: number[],
  peakIdx: number,
  target: number,
): number {
  for (let i = peakIdx; i < values.length - 1; i++) {
    const v0 = values[i]
    const v1 = values[i + 1]
    if (v1 <= target && v0 > target) {
      const span = v0 - v1
      const frac = span === 0 ? 0 : (v0 - target) / span
      return angles[i] + frac * (angles[i + 1] - angles[i])
    }
  }
  // Never dropped to the target within the sampled range.
  return angles[angles.length - 1] ?? 0
}

/**
 * Compute peak / beam / field metrics for a profile.
 * @throws never — degrades gracefully on a degenerate profile (returns zeros).
 */
export function iesMetrics(profile: IesProfile): IesMetrics {
  const { angles, values } = principalSlice(profile)
  if (values.length === 0) {
    return { peakCandela: 0, peakAngle: 0, beamAngle: 0, fieldAngle: 0 }
  }
  let peakCandela = Number.NEGATIVE_INFINITY
  let peakIdx = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peakCandela) {
      peakCandela = values[i]
      peakIdx = i
    }
  }
  if (!(peakCandela > 0)) {
    return { peakCandela: 0, peakAngle: angles[peakIdx] ?? 0, beamAngle: 0, fieldAngle: 0 }
  }
  const peakAngle = angles[peakIdx]
  // Beam/field measured from the peak angle outward; the full angle is twice the
  // angular distance from the peak to the fraction crossing (symmetric beam).
  const beamHalf = angleAtFraction(angles, values, peakIdx, peakCandela * 0.5) - peakAngle
  const fieldHalf = angleAtFraction(angles, values, peakIdx, peakCandela * 0.1) - peakAngle
  return {
    peakCandela,
    peakAngle,
    // Full angle, clamped non-negative.
    beamAngle: Math.max(0, beamHalf * 2),
    fieldAngle: Math.max(0, fieldHalf * 2),
  }
}

/**
 * Relative luminous intensity at a vertical angle, normalised to the profile's
 * own peak — so the result is a pure DISTRIBUTION SHAPE in `[0, 1]`, with 1 at
 * the peak direction.
 *
 * **Why shape, not absolute candela.** The 2D lux model
 * (`lighting2d/roomLux.ts`) derives magnitude from the emitter registry's
 * stylised intensity via `SCENE_INTENSITY_CALIBRATION`. Feeding a profile's
 * ABSOLUTE candela in would bypass that calibration and silently rescale every
 * lux figure in the app, and doing it correctly would need absolute-vs-relative
 * photometry and `candelaMultiplier` handling this module does not currently
 * assert. Using only the shape is the honest improvement: it makes a 24°
 * narrow-beam downlight and a bare bulb of the same peak intensity compute
 * DIFFERENTLY — which they previously did not — without claiming an absolute
 * photometric magnitude the model cannot back up.
 *
 * Angles outside the sampled range clamp to the nearest sampled value (an IES
 * file that stops at 90° says nothing about what is above it). A degenerate
 * profile returns 1, i.e. falls back to the previous isotropic behaviour rather
 * than zeroing a fixture out.
 */
export function relativeIntensityAt(profile: IesProfile, angleDeg: number): number {
  const { angles, values } = principalSlice(profile)
  if (angles.length === 0 || values.length === 0) return 1
  let peak = Number.NEGATIVE_INFINITY
  for (const v of values) if (v > peak) peak = v
  if (!(peak > 0)) return 1

  const a = Math.abs(angleDeg)
  const first = angles[0] ?? 0
  const last = angles[angles.length - 1] ?? 0
  if (a <= first) return clamp01((values[0] ?? peak) / peak)
  if (a >= last) return clamp01((values[values.length - 1] ?? 0) / peak)

  for (let i = 0; i < angles.length - 1; i++) {
    const a0 = angles[i] ?? 0
    const a1 = angles[i + 1] ?? 0
    if (a >= a0 && a <= a1) {
      const span = a1 - a0
      const t = span === 0 ? 0 : (a - a0) / span
      const v0 = values[i] ?? 0
      const v1 = values[i + 1] ?? 0
      return clamp01((v0 + (v1 - v0) * t) / peak)
    }
  }
  return 1
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}
