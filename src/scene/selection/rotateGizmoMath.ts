import { ROTATE_FINE_STEP } from '../../controls/keybindings'

/** Default angular snap step (15°). Holding Shift bypasses it for free rotation. */
export const GIZMO_SNAP_STEP = ROTATE_FINE_STEP

/** Ring radius beyond the footprint half-extent, and the floor minimum. */
export const GIZMO_HANDLE_GAP = 0.38
export const GIZMO_MIN_RADIUS = 0.55

/** Floor-ring radius for an item whose footprint half-extents are (hx, hz). */
export function gizmoRadius(hx: number, hz: number): number {
  return Math.max(GIZMO_MIN_RADIUS, Math.max(hx, hz) + GIZMO_HANDLE_GAP)
}

/** Angle (radians) from a centre (cx, cz) to a floor point (px, pz), measured so
 *  that 0 points along +Z (the item's facing) and increases toward +X. Matches
 *  the convention used to place the front knob at local (0, 0, r). */
export function pointerAngle(cx: number, cz: number, px: number, pz: number): number {
  return Math.atan2(px - cx, pz - cz)
}

/**
 * Resolve the new item rotation during a gizmo drag. Rotation is *relative* to
 * the grab so picking up the ring anywhere never snaps the piece — the delta
 * between the live pointer angle and the grab angle is added to the rotation
 * captured at grab. When `snap` is true the result quantises to 15° steps.
 */
export function computeRotation(
  startRot: number,
  grabAngle: number,
  currentAngle: number,
  snap: boolean,
): number {
  const next = startRot + (currentAngle - grabAngle)
  if (!snap) return next
  return Math.round(next / GIZMO_SNAP_STEP) * GIZMO_SNAP_STEP
}

/** Normalise radians to [0, 360) degrees for the on-screen readout. */
export function toDegrees(rad: number): number {
  let deg = (rad * 180) / Math.PI
  deg %= 360
  if (deg < 0) deg += 360
  return Math.round(deg)
}
