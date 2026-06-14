import { describe, expect, it } from 'vitest'
import { polylineBounds, polylineLength, polylinePointsAttr } from './polyline'
import type { PlanVec2 } from './types'

describe('polylineLength', () => {
  it('sums segment lengths of an open path', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [3, 0],
      [3, 4],
    ]
    // 3 + 4 = 7 (open: no closing segment).
    expect(polylineLength(pts)).toBeCloseTo(7)
  })

  it('adds the closing segment when closed', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [3, 0],
      [3, 4],
    ]
    // Open 7 + hypot(3,4)=5 closing the loop = 12.
    expect(polylineLength(pts, true)).toBeCloseTo(12)
  })

  it('ignores the closing segment for fewer than 3 points', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [2, 0],
    ]
    expect(polylineLength(pts, true)).toBeCloseTo(2)
  })

  it('returns 0 for fewer than 2 points', () => {
    expect(polylineLength([])).toBe(0)
    expect(polylineLength([[1, 1]])).toBe(0)
  })
})

describe('polylineBounds', () => {
  it('returns the axis-aligned bounding box', () => {
    const pts: PlanVec2[] = [
      [1, 2],
      [5, -1],
      [3, 4],
    ]
    expect(polylineBounds(pts)).toEqual([1, -1, 5, 4])
  })

  it('returns null for an empty path', () => {
    expect(polylineBounds([])).toBeNull()
  })
})

describe('polylinePointsAttr', () => {
  it('maps each vertex through the projector into an SVG points string', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1, 2],
    ]
    // Project doubles each coordinate (e.g. world→pixel scale).
    const out = polylinePointsAttr(pts, ([x, z]) => [x * 2, z * 2])
    expect(out).toBe('0,0 2,4')
  })
})
