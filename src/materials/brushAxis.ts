/**
 * BRUSH-AXIS — per-face anisotropy rotation for brushed metal.
 *
 * `getMetalMaterial` bakes directional brush hairlines that run along the
 * texture U axis (see `procedural/metalBrush.ts`), and three.js renders the
 * matching swept anisotropic highlight with `anisotropyRotation = 0` (the sweep
 * follows U). On a single box that is correct only for the faces whose UVs lay U
 * along the brush's intended direction — but real brushed steel is abraded along
 * ONE physical axis, so on an upright appliance body the hairlines should run
 * VERTICALLY on the front / side panels and stay horizontal on the top, not
 * uniformly along U on every face.
 *
 * `MeshPhysicalMaterial.anisotropyRotation` rotates the anisotropy direction in
 * tangent space (radians, about the surface normal). This module is the pure,
 * deterministic resolver: given a face / mesh normal it returns the rotation that
 * keeps the hairlines along the face's dominant in-plane axis — the convention
 * being that an UPRIGHT face brushes vertically (along world up) and a
 * near-horizontal face keeps the baked U direction.
 *
 * Pure + deterministic + worker-safe (no three, no DOM): a normal in, a number
 * out. The material factory feeds the result to `m.anisotropyRotation`. With no
 * normal it returns the legacy fixed-axis value, so the default render is
 * byte-identical to today.
 */

/** A 3-component direction (need not be unit length). World space, Y is up. */
export type Vec3 = readonly [number, number, number]

/** Rotation (radians) that keeps the baked U-axis hairlines aligned to the brush
 *  direction when NO face normal is supplied — i.e. the legacy fixed-axis sweep.
 *  Wiring sites that pass `undefined` MUST get exactly this, byte-identical to
 *  today (`anisotropyRotation = 0`). */
export const DEFAULT_ANISOTROPY_ROTATION = 0

/** A normal shorter than this is treated as degenerate (no meaningful plane) and
 *  falls back to the default rotation. */
const MIN_NORMAL_LENGTH = 1e-6

/** The quarter-turn that runs the (U-aligned) hairlines vertically instead. */
const QUARTER_TURN = Math.PI / 2

/**
 * Resolve the `anisotropyRotation` for a brushed-metal face from its (world)
 * normal so the hairlines follow the face's dominant in-plane axis.
 *
 *  - `undefined` / `null` → {@link DEFAULT_ANISOTROPY_ROTATION} (legacy fixed
 *    U axis, unchanged — byte-identical to today).
 *  - A degenerate (near-zero) or non-finite normal → the default (no plane to
 *    orient against).
 *  - A near-VERTICAL normal (a top / bottom face, e.g. a worktop) → the default:
 *    world up is OUT of plane, so the dominant in-plane axis is horizontal and
 *    the baked U hairlines already run along it.
 *  - Any other face (upright front / side panels) → a quarter turn so the
 *    hairlines run along world up (the conventional appliance brush direction),
 *    since the up axis lies IN the face plane and is its dominant in-plane axis.
 *
 * Deterministic: the same normal always yields the same rotation.
 */
export function anisotropyRotationForNormal(normal?: Vec3 | null): number {
  if (!normal) return DEFAULT_ANISOTROPY_ROTATION
  const [x, y, z] = normal
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return DEFAULT_ANISOTROPY_ROTATION
  }
  const len = Math.hypot(x, y, z)
  if (len < MIN_NORMAL_LENGTH) return DEFAULT_ANISOTROPY_ROTATION
  // |ny| / len is the cosine of the angle between the normal and world up. When
  // the normal is mostly vertical (close to 1) the face is horizontal: world up
  // is out-of-plane, so the dominant in-plane axis is horizontal and the baked U
  // hairlines already run along it → keep the default. Otherwise the up axis lies
  // in the face plane (it's the dominant in-plane axis for an upright panel) →
  // rotate a quarter turn so the hairlines run vertically. The SQRT1_2 (cos 45°)
  // split puts the boundary exactly between a "wall-ish" and a "floor-ish" face.
  const upAlignment = Math.abs(y) / len
  return upAlignment > Math.SQRT1_2 ? DEFAULT_ANISOTROPY_ROTATION : QUARTER_TURN
}
