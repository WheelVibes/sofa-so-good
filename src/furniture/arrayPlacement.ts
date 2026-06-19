import type { FurnitureItem } from './types'

/** Direction to array along, relative to the item's own facing (it faces local
 *  +Z): `'right'` steps along its width (local +X), `'forward'` along its depth
 *  (local +Z), `'left'` along local -X, `'back'` along local -Z. */
export type ArrayAxis = 'right' | 'forward' | 'left' | 'back'

/** Maximum copies in any single linear or grid array (safety cap). */
export const ARRAY_MAX_COUNT = 200

/**
 * Linear-array placement (pure): centre positions for `count` evenly-spaced
 * copies of `src`, stepping `spacing` metres along the item's local +X
 * (`'right'`), -X (`'left'`), +Z (`'forward'`) or -Z (`'back'`), honouring its
 * Y-rotation so a row of chairs follows the piece's orientation. The caller
 * collision-checks each position and assigns ids — this only does the geometry,
 * so it's unit-testable without a store.
 */
export function arrayOffsets(
  src: Pick<FurnitureItem, 'position' | 'rotation'>,
  count: number,
  spacing: number,
  axis: ArrayAxis,
): Array<[number, number]> {
  const n = Math.max(0, Math.min(ARRAY_MAX_COUNT, Math.floor(count)))
  if (n === 0 || spacing <= 0) return []
  const t = src.rotation
  // Local axis vector (sign-correct per axis choice).
  const sign = axis === 'left' || axis === 'back' ? -1 : 1
  const [lx, lz] = axis === 'right' || axis === 'left' ? [sign, 0] : [0, sign]
  // Three.js Y-rotation of the local step vector into world XZ.
  const wx = lx * Math.cos(t) + lz * Math.sin(t)
  const wz = -lx * Math.sin(t) + lz * Math.cos(t)
  const out: Array<[number, number]> = []
  for (let i = 1; i <= n; i++) {
    out.push([src.position[0] + wx * spacing * i, src.position[1] + wz * spacing * i])
  }
  return out
}

// ---------------------------------------------------------------------------
// Grid (2D) array
// ---------------------------------------------------------------------------

/** One cell in a grid array — the [col, row] index plus world position. */
export interface GridPlacement {
  /** World-space [x, z] position of this copy. */
  position: [number, number]
  /** Column index (0 = source column). */
  col: number
  /** Row index (0 = source row). */
  row: number
}

export interface GridArrayOptions {
  /** Number of columns (total, including the source column). Min 1. */
  cols: number
  /** Number of rows (total, including the source row). Min 1. */
  rows: number
  /** Centre-to-centre spacing between columns, in metres. Clamped to > 0. */
  colSpacing: number
  /** Centre-to-centre spacing between rows, in metres. Clamped to > 0. */
  rowSpacing: number
  /** Column axis: the direction to step for each additional column.
   *  Defaults to `'right'` (item's local +X). */
  colAxis?: ArrayAxis
  /** Row axis: the direction to step for each additional row.
   *  Defaults to `'forward'` (item's local +Z). */
  rowAxis?: ArrayAxis
}

/**
 * Grid (2D) array placement (pure): returns every [col, row] position for a
 * `cols × rows` grid of copies, stepping `colSpacing` in `colAxis` and
 * `rowSpacing` in `rowAxis` (both rotated by the source item's Y-rotation).
 *
 * The source position is (col=0, row=0) and is **not** included in the output —
 * only additional positions are returned. The caller collision-checks each and
 * reports dropped copies.
 *
 * Edge cases:
 * - cols < 1 or rows < 1 → clamped to 1.
 * - cols × rows > ARRAY_MAX_COUNT → total capped at ARRAY_MAX_COUNT; caller is
 *   warned via the returned count.
 * - colSpacing or rowSpacing ≤ 0 → clamped to 0.001 m.
 * - A 1×1 grid → returns [] (nothing to duplicate).
 */
export function gridArrayPlacements(
  src: Pick<FurnitureItem, 'position' | 'rotation'>,
  opts: GridArrayOptions,
): GridPlacement[] {
  const cols = Math.max(1, Math.floor(opts.cols))
  const rows = Math.max(1, Math.floor(opts.rows))
  const colSpacing = Math.max(0.001, opts.colSpacing)
  const rowSpacing = Math.max(0.001, opts.rowSpacing)
  const colAxis: ArrayAxis = opts.colAxis ?? 'right'
  const rowAxis: ArrayAxis = opts.rowAxis ?? 'forward'

  const t = src.rotation

  // Helper: convert a local-axis direction to a world (wx, wz) unit step.
  const axisStep = (axis: ArrayAxis): [number, number] => {
    const sign = axis === 'left' || axis === 'back' ? -1 : 1
    const [lx, lz] = axis === 'right' || axis === 'left' ? [sign, 0] : [0, sign]
    return [lx * Math.cos(t) + lz * Math.sin(t), -lx * Math.sin(t) + lz * Math.cos(t)]
  }

  const [cwx, cwz] = axisStep(colAxis)
  const [rwx, rwz] = axisStep(rowAxis)

  const out: GridPlacement[] = []
  let total = 0
  for (let r = 0; r < rows && total < ARRAY_MAX_COUNT; r++) {
    for (let c = 0; c < cols && total < ARRAY_MAX_COUNT; c++) {
      if (c === 0 && r === 0) continue // skip source cell
      const x = src.position[0] + cwx * colSpacing * c + rwx * rowSpacing * r
      const z = src.position[1] + cwz * colSpacing * c + rwz * rowSpacing * r
      out.push({ position: [x, z], col: c, row: r })
      total++
    }
  }
  return out
}
