/**
 * GLB Asset Designer — Stage 6d precision II: **pivot control** for rotate /
 * scale. Pure math (three's math classes only — no GPU, no store), so every
 * compensation is unit-testable.
 *
 * A part's `position` is its CENTRE and its geometry is centred at the local
 * origin, so three rotates/scales it about that centre. To rotate/scale about a
 * different reference point (the **base** — bottom-face centre — or the **min
 * corner**) we keep the transform maths unchanged and instead COMPENSATE the
 * centre position so the chosen pivot point stays fixed in world space:
 *
 *  - Rotate about a pivot: `C' = C + R_old·o − R_new·o`, where `o` is the pivot's
 *    offset from the centre in the part's local frame (invariant under a size-
 *    preserving rotation).
 *  - Scale about a pivot: with the new size known, place the centre so the pivot
 *    feature keeps its world coordinate — for the base that means the bottom face
 *    stays put and the part grows upward; for the min corner all three min faces
 *    stay put.
 *
 * `center` is the identity (today's behaviour, byte-identical): three already
 * rotates/scales about the centre, so no compensation is applied and the returned
 * position equals the input.
 */

import { Euler, Matrix4, Vector3 } from 'three'

const DEG = Math.PI / 180

/** The reference point a rotate/scale pivots around. */
export type PivotMode = 'center' | 'base' | 'corner'

/** Segmented-control order + labels for the pivot picker. */
export const PIVOT_MODES: { mode: PivotMode; label: string; title: string }[] = [
  { mode: 'center', label: 'Centre', title: 'Rotate / scale about the centre (default)' },
  {
    mode: 'base',
    label: 'Base',
    title: 'Rotate / scale about the bottom face (keeps it on the floor)',
  },
  { mode: 'corner', label: 'Corner', title: 'Rotate / scale about the min (−X −Y −Z) corner' },
]

type Vec3 = [number, number, number]

/** Kill float dust + normalise -0. */
function clean(v: number): number {
  const r = Number(v.toFixed(6))
  return r === 0 ? 0 : r
}

const cleanVec = (v: Vector3): Vec3 => [clean(v.x), clean(v.y), clean(v.z)]

/**
 * The pivot point's offset from the part CENTRE in the part's LOCAL frame, given
 * the local size (full W/H/D). `center` → origin; `base` → bottom-face centre
 * (−Y half); `corner` → the −X −Y −Z corner. Pure.
 */
export function pivotOffset(mode: PivotMode, size: readonly [number, number, number]): Vec3 {
  const [w, h, d] = size
  switch (mode) {
    case 'base':
      return [0, -h / 2, 0]
    case 'corner':
      return [-w / 2, -h / 2, -d / 2]
    default:
      return [0, 0, 0]
  }
}

/** Rotation matrix for an Euler-XYZ degree triple (absent → identity). */
function rotMatrix(rotationDeg?: readonly number[]): Matrix4 {
  const r = rotationDeg ?? [0, 0, 0]
  return new Matrix4().makeRotationFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'))
}

/**
 * Compensated centre position after a ROTATION change so the `mode` pivot point
 * stays fixed in world space. `center` mode returns `position` unchanged
 * (byte-identical to today). Pure.
 */
export function rotatePivotPosition(
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  oldRotationDeg: readonly number[] | undefined,
  newRotationDeg: readonly number[] | undefined,
  mode: PivotMode,
): Vec3 {
  if (mode === 'center') return [position[0], position[1], position[2]]
  const o = new Vector3(...pivotOffset(mode, size))
  const oldTerm = o.clone().applyMatrix4(rotMatrix(oldRotationDeg))
  const newTerm = o.clone().applyMatrix4(rotMatrix(newRotationDeg))
  // C' = C + R_old·o − R_new·o
  const c = new Vector3(position[0], position[1], position[2]).add(oldTerm).sub(newTerm)
  return cleanVec(c)
}

/**
 * Compensated centre position after a SCALE (size change) so the `mode` pivot
 * point stays fixed. With the part rotated by `rotationDeg`, the pivot offset
 * grows in the local frame and is rotated into world space: `C' = C + R·(o_old −
 * o_new)`. `center` returns `position` unchanged. Pure.
 */
export function scalePivotPosition(
  position: readonly [number, number, number],
  oldSize: readonly [number, number, number],
  newSize: readonly [number, number, number],
  rotationDeg: readonly number[] | undefined,
  mode: PivotMode,
): Vec3 {
  if (mode === 'center') return [position[0], position[1], position[2]]
  const oOld = new Vector3(...pivotOffset(mode, oldSize))
  const oNew = new Vector3(...pivotOffset(mode, newSize))
  const diff = oOld.sub(oNew).applyMatrix4(rotMatrix(rotationDeg))
  const c = new Vector3(position[0], position[1], position[2]).add(diff)
  return cleanVec(c)
}

/**
 * Compensated GROUP origin after a rotation change so the group's `mode` pivot
 * stays fixed. A transform group rotates about its origin (`group.position`), so
 * `center` maps to that origin (identity = today). `base`/`corner` use the
 * members' union bounds (in the group's local frame) to find the pivot offset
 * from the origin. Pure.
 */
export function groupRotatePivotPosition(
  groupPosition: readonly [number, number, number] | undefined,
  unionCenter: readonly [number, number, number],
  unionMin: readonly [number, number, number],
  oldRotationDeg: readonly number[] | undefined,
  newRotationDeg: readonly number[] | undefined,
  mode: PivotMode,
): Vec3 {
  const gp = groupPosition ?? [0, 0, 0]
  if (mode === 'center') return [gp[0], gp[1], gp[2]]
  // Pivot point in the group's local (pre-rotation) frame, relative to the origin.
  const o =
    mode === 'base'
      ? new Vector3(unionCenter[0], unionMin[1], unionCenter[2])
      : new Vector3(unionMin[0], unionMin[1], unionMin[2])
  const oldTerm = o.clone().applyMatrix4(rotMatrix(oldRotationDeg))
  const newTerm = o.clone().applyMatrix4(rotMatrix(newRotationDeg))
  const c = new Vector3(gp[0], gp[1], gp[2]).add(oldTerm).sub(newTerm)
  return cleanVec(c)
}
