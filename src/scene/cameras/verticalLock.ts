/**
 * Two-point-perspective / vertical-line-lock (FEAT-D) — pure projection math.
 *
 * Orbiting to a pitched angle (looking down at the flat from a 3/4 dollhouse
 * view, or up at a tall space) tilts the camera's optical axis off the
 * horizontal — exactly what makes vertical building lines (wall corners, door
 * frames) converge toward a vanishing point, the classic "amateur real-estate
 * photo" tell. Architectural/real-estate photographers fix this with a shift
 * lens: level the camera (so its image plane stays parallel to every vertical
 * line in the scene, which is what keeps them rendering as parallel vertical
 * lines) and shift the lens/sensor vertically to reframe the shot that
 * pitching the camera would otherwise have produced. D5 Render/Enscape ship
 * this as a one-click "two-point perspective" camera toggle (REFERENCES.md).
 *
 * The shift is exact, not an approximation: for a pinhole camera, the ray
 * that reaches a given point in the world depends only on the camera's
 * optical centre + the direction of the ray, never on where that ray is
 * re-centred on the image plane. A level camera's image plane already
 * contains the world-up direction, so any vertical world line projects to a
 * vertical image line on it; picking a different (shifted) window of that
 * same image plane recentres the frame without ever rotating the plane, so
 * verticals stay exactly parallel. Levelling loses the original pitch's
 * framing — `offsetY` below is the vertical shift (in the same units as
 * three's `PerspectiveCamera.view.offsetY` when `view.fullHeight`/
 * `view.height` are both 1) that puts the original look-at target back at
 * the centre of the shifted frame.
 *
 * Dependency-free (no three.js import, mirrors `cameraLensSettings.ts`) so
 * this is unit-testable without a renderer; `OrbitCamera.tsx` applies the
 * result to the live `PerspectiveCamera` once per frame while the
 * `twoPointPerspective` toggle is on.
 */

/** Pitch angles beyond this are clamped before computing the lens shift —
 *  near a straight-down/up view the shift blows up (tan → ∞) to correct a
 *  problem (converging verticals) that barely reads at that angle anyway,
 *  and an unclamped shift there would badly skew the frame. */
export const MAX_LOCK_PITCH_RAD = (75 * Math.PI) / 180

/** Camera looks are treated as "already level" (nothing meaningful to
 *  correct) below this horizontal camera→target distance — avoids a
 *  divide-by-~0 / undefined yaw at the near-top-down gimbal edge. */
const MIN_HORIZONTAL_DIST = 1e-4

export interface VerticalLockInput {
  /** Camera world position [x, y, z]. */
  pos: readonly [number, number, number]
  /** Orbit target the camera is currently looking at (world). */
  target: readonly [number, number, number]
  /** Camera vertical field of view, in degrees (three's `PerspectiveCamera.fov`). */
  fovDeg: number
}

export interface VerticalLockResult {
  /** False at the near-top-down gimbal edge (camera is already effectively
   *  level / yaw is undefined) — nothing to correct, apply no shift. */
  active: boolean
  /** Look-at target that levels the camera: same yaw + horizontal distance as
   *  the input target, at the camera's own height (zero pitch). Equal to the
   *  input target when `active` is false. */
  leveledTarget: [number, number, number]
  /** Pitch angle removed, radians (unclamped). Positive = was looking up,
   *  negative = looking down (the common orbit-dollhouse case). */
  pitchRad: number
  /** Vertical projection-window shift to assign to `camera.view.offsetY`
   *  (with `view.fullWidth`/`fullHeight`/`width`/`height` all `1`) so the
   *  original target re-centres in the leveled frame. `0` when `active` is
   *  false or the camera was already level. */
  offsetY: number
}

/**
 * Given the orbit camera's live pose + lens, compute the level look-at target
 * and the vertical lens-shift that keeps verticals vertical without losing
 * the original framing. See the module doc for the shift-lens derivation.
 */
export function computeVerticalLock({
  pos,
  target,
  fovDeg,
}: VerticalLockInput): VerticalLockResult {
  const dx = target[0] - pos[0]
  const dy = target[1] - pos[1]
  const dz = target[2] - pos[2]
  const horizontalDist = Math.hypot(dx, dz)
  if (!Number.isFinite(horizontalDist) || horizontalDist < MIN_HORIZONTAL_DIST) {
    return {
      active: false,
      leveledTarget: [target[0], target[1], target[2]],
      pitchRad: 0,
      offsetY: 0,
    }
  }
  const pitchRad = Math.atan2(dy, horizontalDist)
  const clampedPitch = Math.max(-MAX_LOCK_PITCH_RAD, Math.min(MAX_LOCK_PITCH_RAD, pitchRad))
  const safeFovDeg = Number.isFinite(fovDeg) ? Math.max(1, Math.min(179, fovDeg)) : 50
  const halfFovRad = (safeFovDeg * Math.PI) / 360
  // Derivation: at the near plane, a ray at elevation angle φ crosses at
  // height near*tan(φ) (independent of fov/zoom — purely the ray's angle).
  // The un-shifted frustum's half-height is near*tan(halfFov); shifting the
  // window by `offsetY` moves its centre to -offsetY*height. Solving for the
  // target's ray to land exactly at the new centre gives the near-independent
  // closed form below (see module doc).
  const offsetY = -Math.tan(clampedPitch) / (2 * Math.tan(halfFovRad))
  return {
    active: true,
    leveledTarget: [target[0], pos[1], target[2]],
    pitchRad,
    offsetY,
  }
}
