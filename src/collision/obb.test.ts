import { describe, expect, it } from 'vitest'
import { type OBB, obbCorners, obbMtv, obbVsObb, obbVsSegment, type Segment } from './obb'

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

describe('obbMtv (minimum translation vector for soft push-apart)', () => {
  it('returns null when the boxes do not overlap', () => {
    expect(obbMtv(aabb(0, 0, 1, 1), aabb(5, 0, 1, 1))).toBeNull()
  })

  it('returns null when boxes merely touch (gap == 0 is not penetration)', () => {
    // A spans x∈[-0.5,0.5], B spans x∈[0.5,1.5] — edges coincide, no overlap.
    expect(obbMtv(aabb(0, 0, 1, 1), aabb(1, 0, 1, 1))).toBeNull()
  })

  it('pushes A along the shallow axis by the penetration depth', () => {
    // A@(0,0) B@(0.8,0), both 1×1 → overlap 0.2 on X, none-to-spare on Z (1.0).
    const mtv = obbMtv(aabb(0, 0, 1, 1), aabb(0.8, 0, 1, 1))
    expect(mtv).not.toBeNull()
    if (!mtv) return
    expect(mtv.depth).toBeCloseTo(0.2)
    // Min-penetration axis is X; A is left of B, so it's pushed further −X.
    expect(Math.abs(mtv.nx)).toBeCloseTo(1)
    expect(mtv.nz).toBeCloseTo(0)
    expect(mtv.nx).toBeLessThan(0)
  })

  it('orients the push away from B (A on the right → +X)', () => {
    const mtv = obbMtv(aabb(0.8, 0, 1, 1), aabb(0, 0, 1, 1))
    expect(mtv?.nx).toBeGreaterThan(0)
  })

  it('picks the axis of least penetration when they differ', () => {
    // X overlap = 1.0−0.9 = 0.1; Z overlap = 1.0−0.2 = 0.8 → choose X (0.1).
    const mtv = obbMtv(aabb(0, 0, 1, 1), aabb(0.9, 0.2, 1, 1))
    expect(mtv?.depth).toBeCloseTo(0.1)
    expect(Math.abs(mtv?.nx ?? 0)).toBeCloseTo(1)
  })

  it('is a unit separation axis (nx,nz normalised)', () => {
    // A x∈[-1,1]; B@1.3 x∈[0.8,1.8] → overlaps by 0.2 on X (genuinely penetrating).
    const mtv = obbMtv(aabb(0, 0, 2, 1), aabb(1.3, 0.3, 1, 1))
    expect(mtv).not.toBeNull()
    if (!mtv) return
    expect(Math.hypot(mtv.nx, mtv.nz)).toBeCloseTo(1)
  })

  it('handles fully coincident boxes (max penetration, still non-null)', () => {
    const mtv = obbMtv(aabb(0, 0, 1, 1), aabb(0, 0, 1, 1))
    expect(mtv).not.toBeNull()
    expect(mtv?.depth).toBeCloseTo(1)
  })
})
