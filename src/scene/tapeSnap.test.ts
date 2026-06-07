import { describe, expect, it } from 'vitest'
import { snapToNearest, TAPE_SNAP_DISTANCE } from './tapeSnap'

describe('snapToNearest', () => {
  const corners: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 3],
  ]

  it('snaps to a candidate within the radius', () => {
    expect(snapToNearest(2.1, 0.05, corners)).toEqual([2, 0])
  })

  it('returns the original point when nothing is close enough', () => {
    expect(snapToNearest(5, 5, corners)).toEqual([5, 5])
  })

  it('picks the nearest of several in range', () => {
    // (1.9,2.9) is nearer (2,3) than (2,0).
    expect(snapToNearest(1.9, 2.9, corners)).toEqual([2, 3])
  })

  it('respects a custom threshold', () => {
    expect(snapToNearest(0.25, 0, corners, 0.1)).toEqual([0.25, 0]) // 0.25 > 0.1 → no snap
    expect(snapToNearest(0.25, 0, corners, TAPE_SNAP_DISTANCE)).toEqual([0, 0])
  })
})
