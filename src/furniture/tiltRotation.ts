import type { EulerOrder } from 'three'
import type { FurnitureItem } from './types'

/**
 * Multi-axis furniture rotation (SweetHome3DJS tilt parity, adapted + optimized).
 *
 * SweetHome3DJS composes three explicit rotation matrices (yaw·pitch·roll) per
 * vertex to tilt a piece. Three.js gives us that composition for free via an
 * intrinsic Euler with an explicit order, so instead of hand-rolling matrix
 * multiplies we hand the renderer one `[x, y, z, order]` tuple — one allocation,
 * no per-frame matrix math, and the GPU-side world matrix does the rest.
 *
 * Order **'YXZ'** = yaw first (about world up), then pitch (about the now-rotated
 * local X — nose up/down), then roll (about local Z — bank). That matches how a
 * user thinks about placing then tilting a piece, and reduces to the previous
 * pure-yaw behaviour (`[0, yaw, 0]`) when pitch/roll are absent, so existing
 * layouts render identically.
 */
const TILT_ORDER: EulerOrder = 'YXZ'

export type RotationTuple = [number, number, number, EulerOrder]

/** Euler rotation tuple for a furniture item's full orientation (yaw + tilt). */
export function itemRotation(
  item: Pick<FurnitureItem, 'rotation' | 'pitch' | 'roll'>,
): RotationTuple {
  return [item.pitch ?? 0, item.rotation, item.roll ?? 0, TILT_ORDER]
}

/** True when the item is tilted off-vertical (any non-zero pitch or roll). Used
 *  to drop the flat floor contact shadow, which would read wrong under a tilt. */
export function isTilted(item: Pick<FurnitureItem, 'pitch' | 'roll'>): boolean {
  return !!item.pitch || !!item.roll
}
