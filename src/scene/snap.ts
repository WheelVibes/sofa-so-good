/** Grid size (metres) used when snap-to-grid is enabled. */
export const SNAP_GRID = 0.1

/**
 * Quantise an XZ position to the snap grid. Returns the position unchanged
 * when `grid <= 0`. Pure — unit-tested and reused by the drag controller.
 */
export function snapToGrid(pos: readonly [number, number], grid: number): [number, number] {
  if (grid <= 0) return [pos[0], pos[1]]
  return [Math.round(pos[0] / grid) * grid, Math.round(pos[1] / grid) * grid]
}
