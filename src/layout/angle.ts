const HALF_PI = Math.PI / 2

/** Round a Y-rotation (radians) to the nearest right angle (0/90/180/270°).
 *  Used by the inspector "Straighten" action to square up a freely-rotated
 *  piece (the rotate gizmo allows arbitrary angles with Shift). */
export function nearestRightAngle(rad: number): number {
  return Math.round(rad / HALF_PI) * HALF_PI
}

/** True when `rad` is meaningfully off a right angle (so "Straighten" is worth
 *  offering). Tolerance ~0.5°. */
export function isOffSquare(rad: number): boolean {
  return Math.abs(rad - nearestRightAngle(rad)) > 0.0087
}
