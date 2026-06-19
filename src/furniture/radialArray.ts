/**
 * Radial (polar) array placement — pure geometry, render-agnostic, unit-testable
 * without a store.
 *
 * ## Facing convention
 * Items face +Z when rotation=0 (the app's furniture convention). "Face center"
 * means each copy's front (+Z) points toward the circle center. For a copy at
 * world angle θ (measured CCW from +X in the XZ floor plane), the center is at
 * angle θ+π relative to that copy, so faceCenter yaw = θ + π.
 *
 * ## Angle convention
 * Angles are measured counter-clockwise from +X in the floor XZ plane, in
 * radians, matching Three.js Y-axis rotation semantics. The step direction for
 * even spacing is also CCW.
 *
 * ## Sweep < 360°
 * When sweep < 2π the copies are placed at `startAngle + i * step` for
 * `i = 0 … count-1` where `step = sweep / (count - 1)` (inclusive both ends).
 * This makes a count=2 half-circle put one copy at the start, one at the end.
 * When sweep = 2π (full circle) the spacing is exclusive at the seam:
 * `step = 2π / count`, so the last copy doesn't overlap the first.
 *
 * ## Edge cases
 * - count < 2  → returns [] (no meaningful ring; caller should no-op)
 * - radius ≤ 0 → clamped to MIN_RADIUS (0.01 m) so copies don't stack on center
 * - sweep ≤ 0  → returns [] (degenerate)
 */

/** Minimum allowed radius (metres). Prevents stacking at the center. */
export const RADIAL_MIN_RADIUS = 0.01
/** Maximum copies in a single radial array. */
export const RADIAL_MAX_COUNT = 36

export interface RadialPlacement {
  /** World-space [x, z] position of this copy. */
  position: [number, number]
  /** Y-axis yaw in radians for this copy. */
  rotation: number
}

export interface RadialArrayOptions {
  /** World-space [x, z] center of the ring.
   *  Defaults to the source item's position. */
  center?: [number, number]
  /** Ring radius in metres. Clamped to RADIAL_MIN_RADIUS. */
  radius: number
  /** Number of copies (including the logical "first" position — the caller
   *  decides whether to include the source item itself). Must be ≥ 2. */
  count: number
  /** Starting angle in radians, measured CCW from +X in the floor XZ plane.
   *  Defaults to 0 (copy starts along +X from center). */
  startAngle?: number
  /** Total angular sweep in radians.
   *  Default: 2π (full circle).
   *  0 ≤ sweep ≤ 2π is the usable range; values > 2π are clamped to 2π. */
  sweep?: number
  /** If true, each copy's yaw is set so its front (+Z) faces the center.
   *  If false, each copy keeps the source item's original rotation.
   *  Defaults to true. */
  faceCenter?: boolean
  /** Fallback yaw to apply when faceCenter=false.
   *  Usually the source item's rotation. */
  baseRotation?: number
}

/**
 * Compute N evenly-spaced radial placements around a circle.
 *
 * Returns an array of `{ position, rotation }`. The caller is responsible for
 * collision-checking each position and committing to the store in a batch.
 */
export function radialArrayPlacements(opts: RadialArrayOptions): RadialPlacement[] {
  const {
    center = [0, 0],
    radius,
    count,
    startAngle = 0,
    sweep: rawSweep,
    faceCenter = true,
    baseRotation = 0,
  } = opts

  const n = Math.max(0, Math.min(RADIAL_MAX_COUNT, Math.floor(count)))
  if (n < 2) return []

  const r = Math.max(RADIAL_MIN_RADIUS, radius)

  // Normalise sweep: clamp to [0, 2π]; default = full circle.
  const TWO_PI = 2 * Math.PI
  const sweep = rawSweep === undefined ? TWO_PI : Math.max(0, Math.min(TWO_PI, rawSweep))
  if (sweep <= 0) return []

  // Step between copies.
  // Full circle (sweep ≈ 2π): exclusive seam — step = 2π / n, i = 0…n-1.
  // Partial sweep: inclusive both ends — step = sweep / (n-1), i = 0…n-1.
  const isFullCircle = Math.abs(sweep - TWO_PI) < 1e-9
  const step = isFullCircle ? TWO_PI / n : sweep / (n - 1)

  const placements: RadialPlacement[] = []
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * step
    const x = center[0] + r * Math.cos(angle)
    const z = center[1] + r * Math.sin(angle)

    // "Face center" yaw: the item's front (+Z) points toward center.
    // Three.js Y-rotation θ makes the item's local +Z face world direction
    //   (X=sin θ, Z=cos θ)  in the floor plane.
    // A copy at circle angle `angle` sits at (cx + r·cos angle, cz + r·sin angle).
    // Direction from copy toward center = (-cos angle, -sin angle) in (X, Z).
    // We need:  sin θ = -cos(angle)  and  cos θ = -sin(angle)
    // → θ = atan2(-cos(angle), -sin(angle))
    const rotation = faceCenter ? Math.atan2(-Math.cos(angle), -Math.sin(angle)) : baseRotation

    placements.push({ position: [x, z], rotation })
  }
  return placements
}
