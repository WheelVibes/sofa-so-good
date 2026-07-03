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

// --- Spherical (orbit-relative) interpolation ------------------------------
//
// TV-SNAP: every eased camera fly (saved view / focus / top / home) used to
// linearly lerp `camera.position` and `controls.target` in Cartesian space,
// then hand the result to OrbitControls' `update()`, which internally derives
// the camera's orientation from the (position - target) offset via spherical
// decomposition + `lookAt`. A straight-line Cartesian path from an off-axis
// pose to a near-overhead one (top view) does NOT imply a straight-line path
// in (radius, polar, azimuth) space — the implied azimuth can swing sharply as
// the offset's horizontal component shrinks toward the vertical pole, and
// `lookAt`'s internal up-vector cross product is numerically unstable right at
// that pole. The visible symptom: smooth positional travel, then a violent
// rotational snap on the last frame(s).
//
// The fix: interpolate the *orbital* parameters directly — radius and polar
// angle by plain lerp (neither wraps), azimuth by the shortest angular arc —
// so the implied rotation rate is bounded and continuous all the way to the
// pole, instead of being an emergent (and unstable) side effect of lerping
// Cartesian endpoints.

/** A camera pose expressed relative to its look-at target. */
export interface OrbitSpherical {
  /** Distance from target to camera. */
  radius: number
  /** Angle from the +Y axis (0 = straight overhead, π/2 = eye-level). */
  phi: number
  /** Azimuth around the +Y axis, matching three.js `Spherical` (atan2(x, z)). */
  theta: number
}

/** Decompose a camera position relative to its look-at target into orbital
 *  spherical coordinates. Degenerate (near-zero-radius) input returns a
 *  harmless zeroed spherical rather than NaN. */
export function toOrbitSpherical(pos: Vec3, target: Vec3): OrbitSpherical {
  const ox = pos[0] - target[0]
  const oy = pos[1] - target[1]
  const oz = pos[2] - target[2]
  const radius = Math.sqrt(ox * ox + oy * oy + oz * oz)
  if (!Number.isFinite(radius) || radius < 1e-9) return { radius: 0, phi: 0, theta: 0 }
  const phi = Math.acos(Math.min(1, Math.max(-1, oy / radius)))
  const theta = Math.atan2(ox, oz)
  return { radius, phi, theta }
}

/** Reconstruct a world-space position from orbital spherical coordinates
 *  around `target`. Exact inverse of `toOrbitSpherical`. */
export function fromOrbitSpherical(s: OrbitSpherical, target: Vec3): Vec3 {
  const sinPhi = Math.sin(s.phi)
  const ox = s.radius * sinPhi * Math.sin(s.theta)
  const oy = s.radius * Math.cos(s.phi)
  const oz = s.radius * sinPhi * Math.cos(s.theta)
  return [target[0] + ox, target[1] + oy, target[2] + oz]
}

/** Interpolate an angle (radians) along its shortest arc — never the long way
 *  around. Result is not normalized to any particular range, only continuous
 *  in `t`. */
export function shortestAngleLerp(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  else if (delta < -Math.PI) delta += twoPi
  return from + delta * t
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

/**
 * The shared eased-fly pose used by every camera retarget (saved view, focus,
 * top, home): the look-at target lerps linearly (its own path is never near a
 * singularity), while the camera position is reconstructed from spherical
 * coordinates interpolated around that target — radius/polar by lerp, azimuth
 * by shortest arc — so rotation stays smooth all the way through, including a
 * fly that ends (or passes through) straight overhead. `t` is the eased
 * progress in [0, 1]; at `t === 1` this reproduces `toPos`/`toTgt` exactly.
 */
export function flyPose(
  fromPos: Vec3,
  fromTgt: Vec3,
  toPos: Vec3,
  toTgt: Vec3,
  t: number,
): { pos: Vec3; target: Vec3 } {
  const target = lerpVec3(fromTgt, toTgt, t)
  const fromSph = toOrbitSpherical(fromPos, fromTgt)
  const toSph = toOrbitSpherical(toPos, toTgt)
  const radius = lerp(fromSph.radius, toSph.radius, t)
  const phi = lerp(fromSph.phi, toSph.phi, t)
  const theta = shortestAngleLerp(fromSph.theta, toSph.theta, t)
  const pos = fromOrbitSpherical({ radius, phi, theta }, target)
  return { pos, target }
}
