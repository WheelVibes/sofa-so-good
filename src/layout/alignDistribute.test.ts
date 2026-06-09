import { describe, expect, it } from 'vitest'
import {
  type AxisBox,
  alignCenter,
  alignEdge,
  distributeEvenGaps,
  obbAxisHalf,
} from './alignDistribute'

describe('alignCenter', () => {
  it('returns the mean centre', () => {
    expect(
      alignCenter([
        { id: 'a', center: 0, half: 1 },
        { id: 'b', center: 4, half: 1 },
      ]),
    ).toBe(2)
  })
  it('needs at least two boxes', () => {
    expect(alignCenter([{ id: 'a', center: 0, half: 1 }])).toBeNull()
    expect(alignCenter([])).toBeNull()
  })
})

describe('alignEdge', () => {
  const boxes: AxisBox[] = [
    { id: 'a', center: 0, half: 0.5 }, // edges [-0.5, 0.5]
    { id: 'b', center: 3, half: 1.0 }, // edges [2.0, 4.0]
  ]
  it('aligns near edges to the smallest near edge (min)', () => {
    const r = alignEdge(boxes, 'min')
    // smallest near edge is a's -0.5 → both near edges land at -0.5
    expect(r.get('a')).toBeCloseTo(0) // -0.5 + 0.5
    expect(r.get('b')).toBeCloseTo(0.5) // -0.5 + 1.0
  })
  it('aligns far edges to the largest far edge (max)', () => {
    const r = alignEdge(boxes, 'max')
    // largest far edge is b's 4.0 → both far edges land at 4.0
    expect(r.get('a')).toBeCloseTo(3.5) // 4.0 - 0.5
    expect(r.get('b')).toBeCloseTo(3.0) // 4.0 - 1.0
  })
  it('is a no-op below two boxes', () => {
    expect(alignEdge([{ id: 'a', center: 0, half: 1 }], 'min').size).toBe(0)
  })
})

describe('distributeEvenGaps', () => {
  it('keeps the extremes and evens the gaps for equal-size boxes', () => {
    // three unit-half boxes; ends at 0 and 10 → middle should land at 5
    const r = distributeEvenGaps([
      { id: 'a', center: 0, half: 1 },
      { id: 'b', center: 3, half: 1 },
      { id: 'c', center: 10, half: 1 },
    ])
    expect(r.get('a')).toBeCloseTo(0)
    expect(r.get('c')).toBeCloseTo(10)
    expect(r.get('b')).toBeCloseTo(5)
  })

  it('evens edge gaps even when sizes differ (unlike centre spacing)', () => {
    // a:[−0.5,0.5] (half .5), big:half 1.5, c:[9.5,10.5] (half .5)
    // span lo=−0.5 hi=10.5 → 11; totalWidth = 1+3+1 = 5; gap = (11−5)/2 = 3
    const r = distributeEvenGaps([
      { id: 'a', center: 0, half: 0.5 },
      { id: 'big', center: 4, half: 1.5 },
      { id: 'c', center: 10, half: 0.5 },
    ])
    // a stays (centre 0). big: a.far(0.5)+gap(3)+half(1.5) = 5. c: stays 10.
    expect(r.get('a')).toBeCloseTo(0)
    expect(r.get('big')).toBeCloseTo(5)
    expect(r.get('c')).toBeCloseTo(10)
    // verify the two gaps are equal: a.far→big.near and big.far→c.near
    const aFar = 0 + 0.5
    const bigNear = 5 - 1.5
    const bigFar = 5 + 1.5
    const cNear = 10 - 0.5
    expect(bigNear - aFar).toBeCloseTo(cNear - bigFar)
  })

  it('sorts by centre before distributing (order-independent)', () => {
    const r = distributeEvenGaps([
      { id: 'c', center: 10, half: 1 },
      { id: 'a', center: 0, half: 1 },
      { id: 'b', center: 3, half: 1 },
    ])
    expect(r.get('b')).toBeCloseTo(5)
  })

  it('is a no-op below three boxes', () => {
    expect(distributeEvenGaps([{ id: 'a', center: 0, half: 1 }]).size).toBe(0)
    expect(
      distributeEvenGaps([
        { id: 'a', center: 0, half: 1 },
        { id: 'b', center: 5, half: 1 },
      ]).size,
    ).toBe(0)
  })
})

describe('obbAxisHalf', () => {
  it('returns the box half on its own axis when unrotated', () => {
    expect(obbAxisHalf(0.5, 1.5, 0, 0)).toBeCloseTo(0.5)
    expect(obbAxisHalf(0.5, 1.5, 0, 1)).toBeCloseTo(1.5)
  })
  it('swaps extents at a quarter turn', () => {
    expect(obbAxisHalf(0.5, 1.5, Math.PI / 2, 0)).toBeCloseTo(1.5)
    expect(obbAxisHalf(0.5, 1.5, Math.PI / 2, 1)).toBeCloseTo(0.5)
  })
  it('is the sum of projected extents at 45°', () => {
    const h = obbAxisHalf(0.5, 1.5, Math.PI / 4, 0)
    expect(h).toBeCloseTo((0.5 + 1.5) * Math.SQRT1_2)
  })
})
