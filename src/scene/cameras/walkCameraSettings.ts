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
