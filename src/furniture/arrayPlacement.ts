import type { FurnitureItem } from './types'

/** Direction to array along, relative to the item's own facing (it faces local
 *  +Z): `'right'` steps along its width, `'forward'` along its depth. */
export type ArrayAxis = 'right' | 'forward'

/**
 * Linear-array placement (pure): centre positions for `count` evenly-spaced
 * copies of `src`, stepping `spacing` metres along the item's local +X
 * (`'right'`) or +Z (`'forward'`), honouring its Y-rotation so a row of chairs
 * follows the piece's orientation. The caller collision-checks each position and
 * assigns ids — this only does the geometry, so it's unit-testable without a store.
 */
export function arrayOffsets(
  src: Pick<FurnitureItem, 'position' | 'rotation'>,
  count: number,
  spacing: number,
  axis: ArrayAxis,
): Array<[number, number]> {
  const n = Math.max(0, Math.floor(count))
  if (n === 0 || spacing <= 0) return []
  const t = src.rotation
  const [lx, lz] = axis === 'right' ? [1, 0] : [0, 1]
  // three.js Y-rotation of the local step vector into world XZ.
  const wx = lx * Math.cos(t) + lz * Math.sin(t)
  const wz = -lx * Math.sin(t) + lz * Math.cos(t)
  const out: Array<[number, number]> = []
  for (let i = 1; i <= n; i++) {
    out.push([src.position[0] + wx * spacing * i, src.position[1] + wz * spacing * i])
  }
  return out
}
