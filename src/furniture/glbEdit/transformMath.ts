/**
 * GLB Asset Designer — shared transform maths for the pivot (`pivot.ts`) and
 * part-group (`groupTransform.ts`) modules. Both need the same Euler-XYZ degree
 * convention, the same float-dust cleaner, and matrix composition from three's
 * math classes, so those helpers live here ONCE rather than duplicated in each.
 *
 * Pure (three's math classes only — no GPU, no store), so every consumer stays
 * unit-testable.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

/** Degrees → radians factor (the spec stores rotations in degrees). */
export const DEG = Math.PI / 180

type Vec3 = [number, number, number]

/** Kill float dust (round to 6dp) + normalise -0 → 0. */
export function clean(v: number): number {
  const r = Number(v.toFixed(6))
  return r === 0 ? 0 : r
}

/** `clean` each component of a Vector3 into a plain tuple. */
export const cleanVec = (v: Vector3): Vec3 => [clean(v.x), clean(v.y), clean(v.z)]

/** Pure rotation matrix for an Euler-XYZ degree triple (absent → identity). */
export function rotationMatrix(rotationDeg?: readonly number[]): Matrix4 {
  const r = rotationDeg ?? [0, 0, 0]
  return new Matrix4().makeRotationFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'))
}

/** Compose a translation + Euler-XYZ (degrees) rotation into a Matrix4 (unit
 *  scale). The parent-frame transform of a group or a part. */
export function trsMatrix(position: readonly number[], rotationDeg?: readonly number[]): Matrix4 {
  const r = rotationDeg ?? [0, 0, 0]
  return new Matrix4().compose(
    new Vector3(position[0], position[1], position[2]),
    new Quaternion().setFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ')),
    new Vector3(1, 1, 1),
  )
}
