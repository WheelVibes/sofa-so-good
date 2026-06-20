/**
 * Pure rebuild-trigger predicate for the procedural sky backdrop.
 *
 * Re-baking the equirect on every sun tick would thrash the GPU (a discrete upload
 * each frame); instead the `SceneBackdrop` adapter keeps the params of the last
 * bake and only re-paints when the sun (direction or turbidity) or the plan
 * orientation has moved past a perceptible threshold. Pure / unit-testable — no
 * three / canvas deps.
 */

import type { Vec3 } from './skyGradient'

export interface SkyState {
  /** Unit sun direction in scene space. */
  sunDir: Vec3
  /** Atmospheric turbidity. */
  turbidity: number
  /** Plan orientation in degrees (rotates the sky with the apartment). */
  orientationDeg: number
}

export interface SkyRebuildThresholds {
  /** Sun-direction angular change, radians. */
  sunAngleRad: number
  /** Turbidity delta. */
  turbidity: number
  /** Orientation change, degrees. */
  orientationDeg: number
}

/** Default thresholds — small enough that the sky tracks the sun smoothly across
 *  the day, large enough that a 60 s system tick or a slider nudge doesn't rebake
 *  for an imperceptible change. */
export const SKY_REBUILD: SkyRebuildThresholds = {
  sunAngleRad: 0.035, // ~2°
  turbidity: 0.25,
  orientationDeg: 1,
}

function angleBetween(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const la = Math.hypot(a[0], a[1], a[2]) || 1
  const lb = Math.hypot(b[0], b[1], b[2]) || 1
  const c = Math.max(-1, Math.min(1, d / (la * lb)))
  return Math.acos(c)
}

/**
 * Whether the sky equirect should be re-baked. `prev` is `null` before the first
 * bake (→ always rebuild). Returns true when the sun direction, turbidity, or plan
 * orientation has changed past the threshold.
 */
export function shouldRebuildSky(
  prev: SkyState | null,
  next: SkyState,
  thresholds: SkyRebuildThresholds = SKY_REBUILD,
): boolean {
  if (!prev) return true
  if (Math.abs(next.turbidity - prev.turbidity) >= thresholds.turbidity) return true
  if (Math.abs(next.orientationDeg - prev.orientationDeg) >= thresholds.orientationDeg) return true
  if (angleBetween(prev.sunDir, next.sunDir) >= thresholds.sunAngleRad) return true
  return false
}
