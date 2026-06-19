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
