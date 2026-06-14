import { describe, expect, it } from 'vitest'
import type { PlanWall } from './types'
import {
  arcFromMidpoint,
  isCurvedWall,
  wallArcPoints,
  wallChords,
  wallCurveMidpoint,
} from './wallArc'

const straight: PlanWall = { id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal' }
const curved: PlanWall = { ...straight, arc: 1 }

describe('isCurvedWall', () => {
  it('treats absent/zero/tiny arc as straight', () => {
    expect(isCurvedWall(straight)).toBe(false)
    expect(isCurvedWall({ arc: 0 })).toBe(false)
    expect(isCurvedWall({ arc: 0.0001 })).toBe(false)
    expect(isCurvedWall(curved)).toBe(true)
  })
})

describe('wallArcPoints', () => {
  it('returns the two endpoints for a straight wall', () => {
    expect(wallArcPoints(straight)).toEqual([
      [0, 0],
      [4, 0],
    ])
  })

  it('starts at start, ends at end, and bulges by `arc` at the midpoint', () => {
    const pts = wallArcPoints(curved, 10)
    expect(pts[0]).toEqual([0, 0])
    expect(pts[pts.length - 1]).toEqual([4, 0])
    const mid = pts[5] // i=5 of 0..10 → t=0.5, the curve midpoint
    // chord along +X → left-normal is (0,1); a +1 bulge lands the midpoint at z≈1.
    expect(mid[0]).toBeCloseTo(2, 6)
    expect(mid[1]).toBeCloseTo(1, 6)
  })

  it('samples a TRUE circular arc (all points equidistant from one centre)', () => {
    const pts = wallArcPoints(curved, 16)
    // Fit the centre from the first 3 points, then check every point is at R.
    const circumcentre = (
      a: [number, number],
      b: [number, number],
      c: [number, number],
    ): [number, number] => {
      const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
      const ux =
        ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) +
          (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) +
          (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) /
        d
      const uy =
        ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) +
          (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) +
          (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) /
        d
      return [ux, uy]
    }
    const [ox, oy] = circumcentre(pts[0], pts[8], pts[16])
    const r0 = Math.hypot(pts[0][0] - ox, pts[0][1] - oy)
    for (const p of pts) {
      expect(Math.hypot(p[0] - ox, p[1] - oy)).toBeCloseTo(r0, 4)
    }
  })
})

describe('wallChords', () => {
  it('returns the wall itself when straight', () => {
    expect(wallChords(straight)).toEqual([straight])
  })

  it('splits a curved wall into N connected chord sub-walls (no openings)', () => {
    const chords = wallChords(curved, 8)
    expect(chords).toHaveLength(8)
    expect(chords[0].start).toEqual([0, 0])
    expect(chords[7].end).toEqual([4, 0])
    // Chords connect end-to-end + inherit thickness.
    for (let i = 0; i < chords.length - 1; i++) {
      expect(chords[i].end).toEqual(chords[i + 1].start)
      expect(chords[i].thickness).toBe('internal')
    }
  })
})

describe('wallCurveMidpoint + arcFromMidpoint round-trip', () => {
  it('midpoint reflects the bulge and inverts back to the arc value', () => {
    const mid = wallCurveMidpoint(curved)
    expect(mid[0]).toBeCloseTo(2, 6)
    expect(mid[1]).toBeCloseTo(1, 6)
    expect(arcFromMidpoint(curved.start, curved.end, mid)).toBeCloseTo(1, 6)
    // A point dragged below the chord yields a negative bulge.
    expect(arcFromMidpoint([0, 0], [4, 0], [2, -0.75])).toBeCloseTo(-0.75, 6)
  })
})
