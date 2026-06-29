import { describe, expect, it } from 'vitest'
import { cornerBevelPoints, cornerFilletArc, filletArcToPolyline } from './cornerFillet'
import type { PlanVec2 } from './types'

const dist = (p: PlanVec2, q: PlanVec2) => Math.hypot(p[0] - q[0], p[1] - q[1])

describe('cornerFilletArc', () => {
  it('rounds a clean 90° corner: tangent dist = r, symmetric, centre on bisector', () => {
    // Rays from the corner: +X (toward a) and +Z (toward b) → interior angle 90°.
    const a: PlanVec2 = [5, 0]
    const corner: PlanVec2 = [0, 0]
    const b: PlanVec2 = [0, 5]
    const r = 1
    const f = cornerFilletArc(a, corner, b, r)
    expect(f).not.toBeNull()
    if (!f) return
    // theta=90° → tan(45°)=1 → tangent dist = r/1 = r.
    expect(dist(f.start, corner)).toBeCloseTo(r, 6)
    expect(dist(f.end, corner)).toBeCloseTo(r, 6)
    // Tangent points lie on their rays.
    expect(f.start[0]).toBeCloseTo(1, 6)
    expect(f.start[1]).toBeCloseTo(0, 6)
    expect(f.end[0]).toBeCloseTo(0, 6)
    expect(f.end[1]).toBeCloseTo(1, 6)
    // Centre equidistant (= r) from both tangent points.
    expect(dist(f.center, f.start)).toBeCloseTo(r, 6)
    expect(dist(f.center, f.end)).toBeCloseTo(r, 6)
    // Centre on the 45° bisector → centre = (1,1), at r/sin45 = √2 from corner.
    expect(f.center[0]).toBeCloseTo(1, 6)
    expect(f.center[1]).toBeCloseTo(1, 6)
    expect(dist(f.center, corner)).toBeCloseTo(r / Math.sin(Math.PI / 4), 6)
    // 90° corner → 90° arc sweep.
    expect(Math.abs(f.sweep)).toBeCloseTo(Math.PI / 2, 6)
  })

  it('rounds a 45° corner (tangent dist = r/tan22.5° > r)', () => {
    const corner: PlanVec2 = [0, 0]
    const a: PlanVec2 = [10, 0] // +X
    const b: PlanVec2 = [10, 10] // 45° from +X
    const r = 1
    const f = cornerFilletArc(a, corner, b, r)
    expect(f).not.toBeNull()
    if (!f) return
    const expected = r / Math.tan(Math.PI / 8) // theta=45°
    expect(dist(f.start, corner)).toBeCloseTo(expected, 6)
    expect(dist(f.end, corner)).toBeCloseTo(expected, 6)
    expect(dist(f.center, f.start)).toBeCloseTo(r, 6)
    expect(dist(f.center, f.end)).toBeCloseTo(r, 6)
    // Acute corner → larger arc sweep (π − theta = 135°).
    expect(Math.abs(f.sweep)).toBeCloseTo(Math.PI - Math.PI / 4, 6)
  })

  it('rounds a 135° corner (tangent dist = r/tan67.5° < r)', () => {
    const corner: PlanVec2 = [0, 0]
    const a: PlanVec2 = [10, 0] // +X
    const b: PlanVec2 = [-10, 10] // 135° from +X
    const r = 1
    const f = cornerFilletArc(a, corner, b, r)
    expect(f).not.toBeNull()
    if (!f) return
    const expected = r / Math.tan((Math.PI * 3) / 8) // theta=135°
    expect(dist(f.start, corner)).toBeCloseTo(expected, 6)
    expect(dist(f.end, corner)).toBeCloseTo(expected, 6)
    expect(dist(f.center, f.start)).toBeCloseTo(r, 6)
    expect(dist(f.center, f.end)).toBeCloseTo(r, 6)
    // Obtuse corner → smaller arc sweep (π − 135° = 45°).
    expect(Math.abs(f.sweep)).toBeCloseTo(Math.PI - (Math.PI * 3) / 4, 6)
  })

  it('returns null for too-large radius (tangent beyond the shorter segment)', () => {
    const corner: PlanVec2 = [0, 0]
    const a: PlanVec2 = [1, 0] // short ray, len 1
    const b: PlanVec2 = [0, 10]
    // 90° corner → tangent dist = r; r=2 > 1 (shorter ray) → null.
    expect(cornerFilletArc(a, corner, b, 2)).toBeNull()
    // r just inside the shorter ray still fits.
    expect(cornerFilletArc(a, corner, b, 0.9)).not.toBeNull()
  })

  it('returns null for collinear rays', () => {
    const corner: PlanVec2 = [0, 0]
    // Anti-parallel (straight through, theta=π).
    expect(cornerFilletArc([5, 0], corner, [-5, 0], 1)).toBeNull()
    // Parallel / same direction (theta=0).
    expect(cornerFilletArc([5, 0], corner, [3, 0], 1)).toBeNull()
  })

  it('returns null for radius ≤ 0 and zero-length rays', () => {
    const corner: PlanVec2 = [0, 0]
    expect(cornerFilletArc([5, 0], corner, [0, 5], 0)).toBeNull()
    expect(cornerFilletArc([5, 0], corner, [0, 5], -1)).toBeNull()
    // Coincident neighbour (zero-length ray).
    expect(cornerFilletArc([0, 0], corner, [0, 5], 1)).toBeNull()
  })
})

describe('cornerBevelPoints', () => {
  it('sets back the two points `setback` metres along each ray', () => {
    const corner: PlanVec2 = [0, 0]
    const a: PlanVec2 = [5, 0]
    const b: PlanVec2 = [0, 5]
    const bev = cornerBevelPoints(a, corner, b, 1.5)
    expect(bev).not.toBeNull()
    if (!bev) return
    expect(bev.start[0]).toBeCloseTo(1.5, 6)
    expect(bev.start[1]).toBeCloseTo(0, 6)
    expect(bev.end[0]).toBeCloseTo(0, 6)
    expect(bev.end[1]).toBeCloseTo(1.5, 6)
    expect(dist(bev.start, corner)).toBeCloseTo(1.5, 6)
    expect(dist(bev.end, corner)).toBeCloseTo(1.5, 6)
  })

  it('returns null on degenerate / too-large setback', () => {
    const corner: PlanVec2 = [0, 0]
    expect(cornerBevelPoints([5, 0], corner, [0, 5], 0)).toBeNull()
    expect(cornerBevelPoints([5, 0], corner, [0, 5], -1)).toBeNull()
    // Setback exceeds the shorter ray (len 1).
    expect(cornerBevelPoints([1, 0], corner, [0, 5], 2)).toBeNull()
    // Zero-length ray.
    expect(cornerBevelPoints([0, 0], corner, [0, 5], 0.5)).toBeNull()
  })
})

describe('filletArcToPolyline', () => {
  it('returns segments+1 points starting/ending at the tangent points, on the arc', () => {
    const f = cornerFilletArc([5, 0], [0, 0], [0, 5], 1)
    expect(f).not.toBeNull()
    if (!f) return
    const pts = filletArcToPolyline(f, 8)
    expect(pts).toHaveLength(9)
    expect(pts[0]).toEqual(f.start)
    expect(pts[8]).toEqual(f.end)
    // Every sampled point sits on the fillet circle (radius from centre).
    const r = dist(f.center, f.start)
    for (const p of pts) {
      expect(dist(f.center, p)).toBeCloseTo(r, 6)
    }
  })

  it('defaults to 8 segments (9 points)', () => {
    const f = cornerFilletArc([5, 0], [0, 0], [0, 5], 1)
    if (!f) throw new Error('expected fillet')
    expect(filletArcToPolyline(f)).toHaveLength(9)
  })
})
