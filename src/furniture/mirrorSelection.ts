import type { FurnitureItem } from './types'

/** Which room axis the mirror line runs perpendicular to: `'x'` reflects each
 *  item's X coordinate (a vertical mirror line, left↔right), `'z'` reflects Z
 *  (a horizontal mirror line, front↔back). */
export type MirrorAxis = 'x' | 'z'

/**
 * Reflect an [x, z] position across the mirror line through `center` — a
 * vertical line `x = center` for axis `'x'`, a horizontal line `z = center`
 * for axis `'z'`. Only the coordinate perpendicular to the line flips; the
 * other is preserved.
 */
export function mirrorPosition(
  position: readonly [number, number],
  axis: MirrorAxis,
  center: number,
): [number, number] {
  const [x, z] = position
  return axis === 'x' ? [2 * center - x, z] : [x, 2 * center - z]
}

/**
 * Flip a Y-yaw heading (radians) under a reflection across `axis`. Furniture
 * faces local +Z at rotation 0, and a three.js Y-rotation θ turns that front
 * to world `(sin θ, cos θ)` (see `layout/faceWall.ts`). Reflecting across a
 * vertical line (axis `'x'`) negates the X component of that heading, which
 * solves to `-rotation`; reflecting across a horizontal line (axis `'z'`)
 * negates the Z component, which solves to `π - rotation`.
 */
export function mirrorRotation(rotation: number, axis: MirrorAxis): number {
  return axis === 'x' ? -rotation : Math.PI - rotation
}

/**
 * Reflect one item's position + heading + geometry across a room axis
 * (through `center`) — a true mirror, not just a turned-around copy: the
 * position + rotation flip per `mirrorPosition`/`mirrorRotation` above, and
 * the matching `flipX`/`flipZ` in-place mirror flag toggles so an asymmetric
 * piece (an L-sofa, a chaise) reads as its mirror image. `props` and
 * everything else are preserved.
 */
export function mirrorItem(item: FurnitureItem, axis: MirrorAxis, center: number): FurnitureItem {
  const position = mirrorPosition(item.position, axis, center)
  const rotation = mirrorRotation(item.rotation, axis)
  return axis === 'x'
    ? { ...item, position, rotation, flipX: !item.flipX }
    : { ...item, position, rotation, flipZ: !item.flipZ }
}

/**
 * The selection's centroid along one axis (mean of its items' positions) —
 * the mirror line a whole-group mirror reflects across, so a rigid group
 * mirror preserves the spacing between its pieces (SketchUp/Coohom "mirror
 * selection" semantics) rather than reflecting each piece in isolation.
 * Returns 0 for an empty selection (never called with one by `mirrorSelection`).
 */
export function selectionCentroid(items: readonly FurnitureItem[], axis: MirrorAxis): number {
  if (items.length === 0) return 0
  const idx = axis === 'x' ? 0 : 1
  return items.reduce((sum, it) => sum + it.position[idx], 0) / items.length
}

/**
 * Mirror a whole selection as a rigid group across its own centroid line (X
 * or Z axis): every item's position + heading + geometry reflects, but the
 * group's relative layout is preserved. Pure — returns the mirrored items
 * (same order/ids as input, none mutated); the caller collision-checks each
 * mirrored placement and commits via the store (see
 * `layout/selectionActions.ts:mirrorSelectionAxis`).
 */
export function mirrorSelection(
  items: readonly FurnitureItem[],
  axis: MirrorAxis,
): FurnitureItem[] {
  const center = selectionCentroid(items, axis)
  return items.map((it) => mirrorItem(it, axis, center))
}
