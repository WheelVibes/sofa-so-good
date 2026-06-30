/**
 * Pure camera-tween math (no three.js / React) so it's unit-testable with
 * explicit inputs. Shared by every eased camera move in <OrbitCamera>: applying
 * a saved view, double-click focus, top-down and reset/home all fly to their
 * destination through this same core instead of snapping instantly.
 *
 * The animation itself (lerping Vector3s, calling controls.update()) lives in
 * OrbitCamera; here we only own the *timing curve* and the *duration*, the two
 * things that decide how a move feels — and the two things worth testing.
 */

/** Smoothstep ease (C¹, zero velocity at both ends) — the classic 3t²−2t³. */
export function smoothstep(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

export type Vec3 = [number, number, number]

/** Squared distance between two points (cheap; no sqrt). */
function dist2(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

/** Fly duration bounds (seconds). A nearby nudge resolves quickly; a long jump
 *  across the flat takes a touch longer so it reads as travel, not a teleport. */
export const FLY_MIN_SECONDS = 0.45
export const FLY_MAX_SECONDS = 0.95
/** Metres of camera travel that maps to the full duration span. */
const FLY_FULL_TRAVEL_M = 18

/**
 * Distance-aware fly duration: scales linearly between the min and max bounds by
 * how far the *camera position* travels (the dominant cue), so short moves snap
 * and long ones glide. Pure → unit-tested. NaN/degenerate inputs fall back to
 * the minimum (never a zero/negative duration that would divide-by-zero a tween).
 */
export function flyDurationFor(fromPos: Vec3, toPos: Vec3): number {
  const d = Math.sqrt(dist2(fromPos, toPos))
  if (!Number.isFinite(d) || d <= 0) return FLY_MIN_SECONDS
  const k = Math.min(1, d / FLY_FULL_TRAVEL_M)
  return FLY_MIN_SECONDS + (FLY_MAX_SECONDS - FLY_MIN_SECONDS) * k
}
