import { describe, expect, it } from 'vitest'
import { SNAP_GRID, snapToGrid } from './snap'

describe('snapToGrid', () => {
  it('rounds to the nearest grid cell', () => {
    expect(snapToGrid([1.04, 2.07], 0.1)).toEqual([1.0, 2.1])
    expect(snapToGrid([1.06, 2.02], 0.1)).toEqual([1.1, 2.0])
  })

  it('returns the position unchanged for a non-positive grid', () => {
    expect(snapToGrid([1.234, 5.678], 0)).toEqual([1.234, 5.678])
  })

  it('snaps with the default grid', () => {
    const [x, z] = snapToGrid([3.33, 4.44], SNAP_GRID)
    expect(x).toBeCloseTo(3.3, 6)
    expect(z).toBeCloseTo(4.4, 6)
  })

  it('snaps to coarser custom grids (0.5 m, 1 m)', () => {
    expect(snapToGrid([1.2, 1.8], 0.5)).toEqual([1.0, 2.0])
    const [x, z] = snapToGrid([1.4, 2.6], 1)
    expect(x).toBeCloseTo(1, 6)
    expect(z).toBeCloseTo(3, 6)
  })
})
