/**
 * Pure clamp helpers + ranges for the walk-mode observer camera (Sweet Home 3D
 * parity, PARITY-WALKCAM): field-of-view and eye-height. Kept dependency-free so
 * the store slice, the camera, persistence and tests all share one source of
 * truth for the sane ranges + defaults.
 */

/** Field-of-view range (degrees) for the first-person observer. */
export const WALK_FOV_MIN = 50
export const WALK_FOV_MAX = 100
export const WALK_FOV_DEFAULT = 70

/** Eye-height range (metres) — roughly a seated child up to a tall adult. */
export const WALK_EYE_MIN = 1.2
export const WALK_EYE_MAX = 1.9
export const WALK_EYE_DEFAULT = 1.6

/** Player collision-circle radius (m) — shared by `FirstPersonCamera`'s
 *  wall/furniture collision AND the minimap tap-to-teleport clamp
 *  (MINIMAP-JUMP), so a teleport lands exactly as clear of a wall as normal
 *  walking already keeps you (one source of truth, not a re-guessed margin). */
export const WALK_PLAYER_RADIUS = 0.25

/** Clamp a field-of-view to the sane walk range. Non-finite → the default. */
export function clampWalkFov(deg: number): number {
  if (!Number.isFinite(deg)) return WALK_FOV_DEFAULT
  return Math.max(WALK_FOV_MIN, Math.min(WALK_FOV_MAX, deg))
}

/** Clamp an eye-height (metres) to the sane walk range. Non-finite → default. */
export function clampWalkEyeHeight(m: number): number {
  if (!Number.isFinite(m)) return WALK_EYE_DEFAULT
  return Math.max(WALK_EYE_MIN, Math.min(WALK_EYE_MAX, m))
}

/** Viewport aspect (width / height) the FOV slider is calibrated against — a
 *  ordinary 3:2 desktop window. three's `PerspectiveCamera.fov` is the VERTICAL
 *  angle, so anything NARROWER than this silently loses sideways view rather than
 *  height: the 70° default is ~96° horizontal on a 1.57 desktop canvas but only
 *  ~43° on a 390×700 phone in portrait — tunnel vision that reads as a cramped
 *  room even though the flat is modeled at true size. `walkVerticalFov` widens the
 *  vertical angle below this aspect so the HORIZONTAL view the slider promises is
 *  what you keep (the "Hor+" convention games use), capped at `WALK_FOV_MAX`.
 *  At or above it the slider value is passed through untouched. */
export const WALK_FOV_REF_ASPECT = 1.5

const DEG = Math.PI / 180

/** Horizontal field of view (degrees) a vertical `fov` yields at `aspect` (w/h). */
export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalFovDeg * DEG) / 2) * aspect)) / DEG
}

/** Vertical fov (degrees) that yields `horizontalFovDeg` across `aspect`. */
export function verticalFovForHorizontal(horizontalFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((horizontalFovDeg * DEG) / 2) / aspect)) / DEG
}

/** The vertical fov to hand three, given the user's slider value and the live
 *  viewport aspect (width / height): the slider value as-is on a viewport at least
 *  as wide as `WALK_FOV_REF_ASPECT`, else widened (up to `WALK_FOV_MAX`) so the
 *  narrow viewport keeps the same HORIZONTAL view instead of a squeezed one. */
export function walkVerticalFov(fovDeg: number, aspect: number): number {
  const v = clampWalkFov(fovDeg)
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= WALK_FOV_REF_ASPECT) return v
  const wanted = verticalFovForHorizontal(horizontalFov(v, WALK_FOV_REF_ASPECT), aspect)
  return Math.min(WALK_FOV_MAX, Math.max(v, wanted))
}
