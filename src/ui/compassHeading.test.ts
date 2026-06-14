import { describe, expect, it } from 'vitest'
import { compassNeedleDeg, forwardToHeadingDeg } from './compassHeading'

describe('forwardToHeadingDeg', () => {
  it('maps the cardinal forward directions (0° = looking toward −Z, clockwise)', () => {
    expect(forwardToHeadingDeg(0, -1)).toBeCloseTo(0)
    expect(forwardToHeadingDeg(1, 0)).toBeCloseTo(90)
    expect(forwardToHeadingDeg(0, 1)).toBeCloseTo(180)
    expect(forwardToHeadingDeg(-1, 0)).toBeCloseTo(270)
  })

  it('always returns a value in [0, 360)', () => {
    for (const [fx, fz] of [
      [0.5, 0.5],
      [-0.3, 0.9],
      [-1, -1],
      [0.2, -0.7],
    ] as const) {
      const h = forwardToHeadingDeg(fx, fz)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})

describe('compassNeedleDeg', () => {
  it('equals the camera heading when North is unrotated (legacy behaviour)', () => {
    expect(compassNeedleDeg(0, 0)).toBe(0)
    expect(compassNeedleDeg(125, 0)).toBe(125)
  })

  it('subtracts the scene North orientation so it tracks true North', () => {
    // Looking down −Z (heading 0) with North rotated +90° → needle points −90°,
    // matching the 2D compass rotation of −orientationDeg.
    expect(compassNeedleDeg(0, 90)).toBe(-90)
    expect(compassNeedleDeg(45, 30)).toBe(15)
  })
})
