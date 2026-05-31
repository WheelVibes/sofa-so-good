import { describe, expect, it } from 'vitest'
import { type OBB, obbCorners, obbVsObb, obbVsSegment, type Segment } from './obb'

const aabb = (cx: number, cz: number, w: number, d: number): OBB => ({
  cx,
  cz,
  hx: w / 2,
  hz: d / 2,
  rot: 0,
})

describe('obb math', () => {
  it('computes 4 corners CCW for an unrotated AABB', () => {
    const c = obbCorners(aabb(0, 0, 2, 4))
    expect(c).toEqual([
      [-1, -2],
      [1, -2],
      [1, 2],
      [-1, 2],
    ])
  })

  it('detects two overlapping AABBs', () => {
    expect(obbVsObb(aabb(0, 0, 1, 1), aabb(0.4, 0.4, 1, 1))).toBe(true)
  })

  it('reports non-overlapping AABBs as separate', () => {
    expect(obbVsObb(aabb(0, 0, 1, 1), aabb(2, 0, 1, 1))).toBe(false)
  })

  it('detects rotated boxes that touch corner-to-corner', () => {
    const a: OBB = { cx: 0, cz: 0, hx: 1, hz: 1, rot: 0 }
    const b: OBB = { cx: 1.4, cz: 0, hx: 1, hz: 1, rot: Math.PI / 4 }
    expect(obbVsObb(a, b)).toBe(true)
  })

  it('separates rotated boxes that miss', () => {
    const a: OBB = { cx: 0, cz: 0, hx: 0.4, hz: 0.4, rot: 0 }
    const b: OBB = { cx: 2.5, cz: 0, hx: 0.4, hz: 0.4, rot: Math.PI / 4 }
    expect(obbVsObb(a, b)).toBe(false)
  })

  it('intersects an OBB with a wall segment crossing it', () => {
    const o: OBB = { cx: 0, cz: 0, hx: 1, hz: 1, rot: 0 }
    const s: Segment = { ax: -2, az: 0, bx: 2, bz: 0 }
    expect(obbVsSegment(o, s)).toBe(true)
  })

  it('does not intersect an OBB with a parallel segment offset by more than the half-extent', () => {
    const o: OBB = { cx: 0, cz: 0, hx: 1, hz: 1, rot: 0 }
    const s: Segment = { ax: -2, az: 1.5, bx: 2, bz: 1.5 }
    expect(obbVsSegment(o, s)).toBe(false)
  })

  it('does not intersect an OBB with a segment whose extent is short of the OBB', () => {
    const o: OBB = { cx: 0, cz: 0, hx: 0.5, hz: 0.5, rot: 0 }
    const s: Segment = { ax: 2, az: 0, bx: 3, bz: 0 }
    expect(obbVsSegment(o, s)).toBe(false)
  })
})
