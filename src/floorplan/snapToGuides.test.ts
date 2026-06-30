import { describe, expect, it } from 'vitest'
import { addGuide, nearestGuide, type PlanGuide, snapToGuides } from './snapToGuides'
import type { PlanVec2 } from './types'

const THRESH = 0.1

describe('snapToGuides', () => {
  it('snaps X only when the point is near a vertical guide (Z unchanged)', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 2 }]
    const out = snapToGuides([2.04, 3.5], guides, THRESH)
    expect(out).toEqual([2, 3.5])
  })

  it('snaps Z only when the point is near a horizontal guide (X unchanged)', () => {
    const guides: PlanGuide[] = [{ axis: 'z', pos: 4 }]
    const out = snapToGuides([1.27, 3.95], guides, THRESH)
    expect(out).toEqual([1.27, 4])
  })

  it('snaps both axes to the intersection of a vertical and a horizontal guide', () => {
    const guides: PlanGuide[] = [
      { axis: 'x', pos: 2 },
      { axis: 'z', pos: 4 },
    ]
    const out = snapToGuides([2.03, 3.97], guides, THRESH)
    expect(out).toEqual([2, 4])
  })

  it('leaves a point unchanged when no guide is within threshold', () => {
    const guides: PlanGuide[] = [
      { axis: 'x', pos: 2 },
      { axis: 'z', pos: 4 },
    ]
    const p: PlanVec2 = [2.5, 4.5]
    const out = snapToGuides(p, guides, THRESH)
    expect(out).toEqual([2.5, 4.5])
  })

  it('snaps to the nearest of several guides on the same axis', () => {
    const guides: PlanGuide[] = [
      { axis: 'x', pos: 1.9 },
      { axis: 'x', pos: 2.05 },
      { axis: 'x', pos: 2.5 },
    ]
    // 2.04 is closest to 2.05 (dist 0.01) over 1.9 (dist 0.14, also out of range).
    const out = snapToGuides([2.04, 0], guides, THRESH)
    expect(out[0]).toBe(2.05)
  })

  it('does not cross-snap (a horizontal guide never moves X, and vice versa)', () => {
    const guides: PlanGuide[] = [{ axis: 'z', pos: 2 }]
    // X is near 2 but the only guide is on the Z axis — X must NOT snap.
    const out = snapToGuides([2.02, 9], guides, THRESH)
    expect(out).toEqual([2.02, 9])
  })

  it('returns a fresh array (does not alias the input point)', () => {
    const p: PlanVec2 = [5, 5]
    const out = snapToGuides(p, [], THRESH)
    expect(out).not.toBe(p)
    expect(out).toEqual([5, 5])
  })

  it('snaps a point exactly on the threshold boundary (inclusive)', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 2 }]
    // Distance is exactly THRESH (0.5 apart, threshold 0.5) — boundary is inclusive.
    const out = snapToGuides([2.5, 0], guides, 0.5)
    expect(out[0]).toBe(2)
  })
})

describe('nearestGuide', () => {
  it('returns the closest in-range guide on the matching axis', () => {
    const guides: PlanGuide[] = [
      { axis: 'x', pos: 1 },
      { axis: 'x', pos: 2.06 },
      { axis: 'z', pos: 2 },
    ]
    const g = nearestGuide(2.05, 'x', guides, THRESH)
    expect(g).toEqual({ axis: 'x', pos: 2.06 })
  })

  it('returns null when no guide on that axis is in range', () => {
    const guides: PlanGuide[] = [
      { axis: 'x', pos: 5 },
      { axis: 'z', pos: 2.05 },
    ]
    expect(nearestGuide(2.05, 'x', guides, THRESH)).toBeNull()
  })

  it('returns null for an empty guide list', () => {
    expect(nearestGuide(0, 'x', [], THRESH)).toBeNull()
  })
})

describe('addGuide', () => {
  it('appends a distinct guide', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 1 }]
    const out = addGuide(guides, { axis: 'z', pos: 3 })
    expect(out).toEqual([
      { axis: 'x', pos: 1 },
      { axis: 'z', pos: 3 },
    ])
  })

  it('keeps two guides on the same axis when far enough apart', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 1 }]
    const out = addGuide(guides, { axis: 'x', pos: 2 })
    expect(out).toHaveLength(2)
  })

  it('de-dupes a near-identical guide on the same axis (within eps)', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 1 }]
    const out = addGuide(guides, { axis: 'x', pos: 1 + 5e-5 })
    expect(out).toEqual([{ axis: 'x', pos: 1 }])
  })

  it('does NOT de-dupe a same-pos guide on a different axis', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 1 }]
    const out = addGuide(guides, { axis: 'z', pos: 1 })
    expect(out).toHaveLength(2)
  })

  it('respects a custom mergeEps', () => {
    const guides: PlanGuide[] = [{ axis: 'z', pos: 4 }]
    // 0.01 apart: de-duped under a 0.05 eps, kept under the default 1e-4.
    expect(addGuide(guides, { axis: 'z', pos: 4.01 }, 0.05)).toHaveLength(1)
    expect(addGuide(guides, { axis: 'z', pos: 4.01 })).toHaveLength(2)
  })

  it('returns a fresh array (does not mutate the input)', () => {
    const guides: PlanGuide[] = [{ axis: 'x', pos: 1 }]
    const out = addGuide(guides, { axis: 'x', pos: 2 })
    expect(out).not.toBe(guides)
    expect(guides).toHaveLength(1)
  })
})
