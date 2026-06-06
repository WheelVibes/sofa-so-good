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

/** Snap a raw angular delta to 15° steps (used for group rotation, where there
 *  is no single absolute rotation to snap). */
export function snapDelta(delta: number, snap: boolean): number {
  return snap ? Math.round(delta / GIZMO_SNAP_STEP) * GIZMO_SNAP_STEP : delta
}

/** Rotate a point (px, pz) about a pivot (cx, cz) by `delta` radians (CCW in the
 *  XZ plane). Used to orbit each member of a multi-selection rigidly around the
 *  group centroid — mirrors the store's `groupRotate` transform. */
export function rotatePointAround(
  px: number,
  pz: number,
  cx: number,
  cz: number,
  delta: number,
): [number, number] {
  const dx = px - cx
  const dz = pz - cz
  const c = Math.cos(delta)
  const s = Math.sin(delta)
  return [cx + dx * c - dz * s, cz + dx * s + dz * c]
}

/** Floor-ring radius enclosing a set of targets (each given as centre + footprint
 *  half-diagonal) measured from a shared pivot. Keeps the ring clear of every
 *  selected piece for a multi-selection. */
export function enclosingRadius(
  pivotX: number,
  pivotZ: number,
  targets: ReadonlyArray<{ cx: number; cz: number; halfDiag: number }>,
): number {
  let r = GIZMO_MIN_RADIUS
  for (const t of targets) {
    const d = Math.hypot(t.cx - pivotX, t.cz - pivotZ) + t.halfDiag + GIZMO_HANDLE_GAP
    if (d > r) r = d
  }
  return r
}

/** Normalise radians to [0, 360) degrees for the on-screen readout. */
export function toDegrees(rad: number): number {
  let deg = (rad * 180) / Math.PI
  deg %= 360
  if (deg < 0) deg += 360
  return Math.round(deg)
}
