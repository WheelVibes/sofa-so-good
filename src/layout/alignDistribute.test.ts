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
    const { positions, clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 1 },
      { id: 'b', center: 3, half: 1 },
      { id: 'c', center: 10, half: 1 },
    ])
    expect(positions.get('a')).toBeCloseTo(0)
    expect(positions.get('c')).toBeCloseTo(10)
    expect(positions.get('b')).toBeCloseTo(5)
    expect(clamped).toBe(false)
  })

  it('evens edge gaps even when sizes differ (unlike centre spacing)', () => {
    // a:[−0.5,0.5] (half .5), big:half 1.5, c:[9.5,10.5] (half .5)
    // span lo=−0.5 hi=10.5 → 11; totalWidth = 1+3+1 = 5; gap = (11−5)/2 = 3
    const { positions, clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 0.5 },
      { id: 'big', center: 4, half: 1.5 },
      { id: 'c', center: 10, half: 0.5 },
    ])
    // a stays (centre 0). big: a.far(0.5)+gap(3)+half(1.5) = 5. c: stays 10.
    expect(positions.get('a')).toBeCloseTo(0)
    expect(positions.get('big')).toBeCloseTo(5)
    expect(positions.get('c')).toBeCloseTo(10)
    // verify the two gaps are equal: a.far→big.near and big.far→c.near
    const aFar = 0 + 0.5
    const bigNear = 5 - 1.5
    const bigFar = 5 + 1.5
    const cNear = 10 - 0.5
    expect(bigNear - aFar).toBeCloseTo(cNear - bigFar)
    expect(clamped).toBe(false)
  })

  it('sorts by centre before distributing (order-independent)', () => {
    const { positions } = distributeEvenGaps([
      { id: 'c', center: 10, half: 1 },
      { id: 'a', center: 0, half: 1 },
      { id: 'b', center: 3, half: 1 },
    ])
    expect(positions.get('b')).toBeCloseTo(5)
  })

  it('is a no-op below three boxes', () => {
    expect(distributeEvenGaps([{ id: 'a', center: 0, half: 1 }]).positions.size).toBe(0)
    expect(distributeEvenGaps([{ id: 'a', center: 0, half: 1 }]).clamped).toBe(false)
    expect(
      distributeEvenGaps([
        { id: 'a', center: 0, half: 1 },
        { id: 'b', center: 5, half: 1 },
      ]).positions.size,
    ).toBe(0)
  })

  // --- PC-DISTRIBUTE-OVERLAP: negative-gap / clamping tests ---

  it('clamps gap to 0 (no overlap) when items are too large, sets clamped=true', () => {
    // span: lo = 0−2 = −2, hi = 6+2 = 8 → span = 10
    // totalWidth = 2*2 + 2*2 + 2*2 = 12 > 10 → rawGap = (10−12)/2 = −1 < 0
    const { positions, clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 2 },
      { id: 'b', center: 3, half: 2 },
      { id: 'c', center: 6, half: 2 },
    ])
    expect(clamped).toBe(true)
    // With gap=0 items are placed flush: a starts at lo=−2
    // a: centre = −2 + 2 = 0; b: centre = 0+2+0+2 = 4; c: centre = 4+2+0+2 = 8
    expect(positions.get('a')).toBeCloseTo(0)
    expect(positions.get('b')).toBeCloseTo(4)
    expect(positions.get('c')).toBeCloseTo(8)
    // No item overlaps its neighbour
    const aFar = (positions.get('a') as number) + 2
    const bNear = (positions.get('b') as number) - 2
    const bFar = (positions.get('b') as number) + 2
    const cNear = (positions.get('c') as number) - 2
    expect(bNear).toBeGreaterThanOrEqual(aFar - 1e-9)
    expect(cNear).toBeGreaterThanOrEqual(bFar - 1e-9)
  })

  it('does not set clamped when gap is exactly 0 (items just touch, no room)', () => {
    // span = 6, totalWidth = 2+2+2 = 6, rawGap = 0 → not negative, not clamped
    const { positions, clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 1 },
      { id: 'b', center: 2, half: 1 },
      { id: 'c', center: 4, half: 1 },
    ])
    expect(clamped).toBe(false)
    expect(positions.get('a')).toBeCloseTo(0)
    expect(positions.get('b')).toBeCloseTo(2)
    expect(positions.get('c')).toBeCloseTo(4)
  })

  it('clamp still produces valid positions for zero-width items (half=0)', () => {
    // All half=0: all stack at the same position, no overlap possible
    const { positions, clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 0 },
      { id: 'b', center: 1, half: 0 },
      { id: 'c', center: 2, half: 0 },
    ])
    expect(clamped).toBe(false)
    // span = 2, totalWidth = 0, gap = 1 — normal distribution
    expect(positions.get('a')).toBeCloseTo(0)
    expect(positions.get('b')).toBeCloseTo(1)
    expect(positions.get('c')).toBeCloseTo(2)
  })

  it('handles four boxes with negative gap — no item overlaps after clamp', () => {
    // Each box half=3, span between extremes = 0−(−3)=3 + (3+3)=6 → lo=−3, hi=3+3=6
    // Actually: a at 0 half 3 → lo=−3; d at 5 half 3 → hi=8 → span=11
    // totalWidth = 4*6 = 24 > 11 → clamped
    const boxes: AxisBox[] = [
      { id: 'a', center: 0, half: 3 },
      { id: 'b', center: 1, half: 3 },
      { id: 'c', center: 3, half: 3 },
      { id: 'd', center: 5, half: 3 },
    ]
    const { positions, clamped } = distributeEvenGaps(boxes)
    expect(clamped).toBe(true)
    // All centres must be in strictly non-overlapping order
    const sorted = ['a', 'b', 'c', 'd'].map((id) => positions.get(id) as number)
    for (let i = 1; i < sorted.length; i++) {
      // far edge of prev ≤ near edge of next (gap=0 means they may touch)
      expect(sorted[i - 1] + 3).toBeLessThanOrEqual(sorted[i] - 3 + 1e-9)
    }
  })

  it('clamped=false for the normal fit case (regression)', () => {
    const { clamped } = distributeEvenGaps([
      { id: 'a', center: 0, half: 0.5 },
      { id: 'b', center: 5, half: 0.5 },
      { id: 'c', center: 10, half: 0.5 },
    ])
    expect(clamped).toBe(false)
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
