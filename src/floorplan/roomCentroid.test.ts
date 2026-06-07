import { describe, expect, it } from 'vitest'
import { roomLabelPoint } from './roomCentroid'
import type { PlanRoom } from './types'

const rect = (over: Partial<PlanRoom> = {}): PlanRoom => ({
  id: 'r',
  name: 'r',
  origin: [2, 4],
  width: 4,
  depth: 2,
  ...over,
})

describe('roomLabelPoint', () => {
  it('returns the centre of a plain rectangle', () => {
    expect(roomLabelPoint(rect())).toEqual([4, 5])
  })

  it('uses the larger rectangle of an L-shape (always inside)', () => {
    // Main 4×2 (area 8); extension 6×4 (area 24) is larger → its centre.
    const r = rect({ extension: { offset: [4, 0], width: 6, depth: 4 } })
    expect(roomLabelPoint(r)).toEqual([2 + 4 + 3, 4 + 0 + 2])
  })

  it('keeps the main rectangle when it is the larger', () => {
    const r = rect({ extension: { offset: [0, 2], width: 1, depth: 1 } })
    expect(roomLabelPoint(r)).toEqual([4, 5])
  })

  it('returns the polygon area centroid', () => {
    // Unit square (0,0)-(2,0)-(2,2)-(0,2) → centroid (1,1).
    const r = rect({
      polygon: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    })
    const [x, z] = roomLabelPoint(r)
    expect(x).toBeCloseTo(1)
    expect(z).toBeCloseTo(1)
  })
})
