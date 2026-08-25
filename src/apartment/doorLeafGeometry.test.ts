import { describe, expect, it } from 'vitest'
import { bifoldLeafFrame, SLIDING_LEAF_OVERLAP, slidingLeafFrame } from './doorLeafGeometry'

/** Along-wall span [lo, hi] a leaf of `width` centred at `centre` covers, in the
 *  hinge-local frame. */
function span(centre: number, width: number): [number, number] {
  return [centre - width / 2, centre + width / 2]
}

describe('bifoldLeafFrame', () => {
  for (const direction of [1, -1] as const) {
    it(`covers the whole opening when closed (direction ${direction})`, () => {
      const width = 0.75
      const f = bifoldLeafFrame(width, direction)
      const outer = span(f.outerCentre, f.halfWidth)
      // The inner leaf's centre is relative to the fold hinge (its parent group).
      const inner = span(f.foldHinge + f.innerCentre, f.halfWidth)
      const lo = Math.min(outer[0], inner[0])
      const hi = Math.max(outer[1], inner[1])
      // Jamb (0) → free jamb (direction * width), fully spanned…
      expect(lo).toBeCloseTo(Math.min(0, direction * width), 10)
      expect(hi).toBeCloseTo(Math.max(0, direction * width), 10)
      // …and the two leaves meet exactly (no gap, no overlap).
      const gap = direction === 1 ? inner[0] - outer[1] : outer[0] - inner[1]
      expect(gap).toBeCloseTo(0, 10)
    })
  }

  it('hinges the fold at the outer leaf far edge', () => {
    const f = bifoldLeafFrame(0.8, 1)
    expect(f.halfWidth).toBeCloseTo(0.4, 10)
    expect(f.foldHinge).toBeCloseTo(0.4, 10)
    expect(f.outerCentre).toBeCloseTo(0.2, 10)
    expect(f.innerCentre).toBeCloseTo(0.2, 10)
  })
})

describe('slidingLeafFrame', () => {
  it('oversizes the leaf past both jambs and the head', () => {
    const f = slidingLeafFrame(0.9, 2.1)
    expect(f.width).toBeCloseTo(0.9 + SLIDING_LEAF_OVERLAP * 2, 10)
    expect(f.height).toBeCloseTo(2.1 + SLIDING_LEAF_OVERLAP, 10)
    // Foot stays on the sill (the leaf grows upward only).
    expect(f.yCentre * 2).toBeCloseTo(f.height, 10)
  })

  it('covers the opening when closed (leaf centred on the opening)', () => {
    const width = 0.9
    const f = slidingLeafFrame(width, 2.1)
    const [lo, hi] = span(0, f.width)
    expect(lo).toBeLessThanOrEqual(-width / 2)
    expect(hi).toBeGreaterThanOrEqual(width / 2)
  })

  it('travels far enough to clear the opening when open', () => {
    const width = 0.9
    const f = slidingLeafFrame(width, 2.1)
    // Parked leaf's near edge must reach past the far jamb.
    expect(f.travel - f.width / 2).toBeGreaterThanOrEqual(width / 2)
  })
})
