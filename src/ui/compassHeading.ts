/**
 * Pure compass-needle math for the on-canvas 3D nav compass (`NavCluster`),
 * kept dependency-free so it can be unit-tested without the R3F/store stack.
 */

/**
 * Camera forward direction (world XZ) → compass bearing in degrees, where 0°
 * means the camera looks toward world −Z (the same "up = −Z" frame the 2D plan
 * editor uses). Increases clockwise: +X → 90°, +Z → 180°, −X → 270°.
 */
export function forwardToHeadingDeg(fx: number, fz: number): number {
  const deg = (Math.atan2(fx, -fz) * 180) / Math.PI
  return (deg + 360) % 360
}

/**
 * Screen rotation (deg) for the compass needle so its "N" points to **scene
 * North**, accounting for both the live camera heading and the user-set North
 * orientation (`orientationDeg`). At `orientationDeg = 0` this is just the camera
 * heading (unchanged legacy behaviour); a non-zero orientation rotates the needle
 * to match the 2D plan compass, which rotates by `-orientationDeg` in its
 * top-down −Z-up frame — so both compasses agree on where North is.
 */
export function compassNeedleDeg(headingDeg: number, orientationDeg: number): number {
  return headingDeg - orientationDeg
}
