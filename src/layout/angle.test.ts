import { describe, expect, it } from 'vitest'
import { isOffSquare, nearestRightAngle } from './angle'

const HALF_PI = Math.PI / 2

describe('nearestRightAngle', () => {
  it('snaps to the nearest multiple of 90°', () => {
    expect(nearestRightAngle(0.3)).toBeCloseTo(0)
    expect(nearestRightAngle(1.0)).toBeCloseTo(HALF_PI)
    // 2.0 rad is nearer π/2 (Δ0.43) than π (Δ1.14); 2.5 rad rounds up to π.
    expect(nearestRightAngle(2.0)).toBeCloseTo(HALF_PI)
    expect(nearestRightAngle(2.5)).toBeCloseTo(Math.PI)
    expect(nearestRightAngle(-0.2)).toBeCloseTo(0)
  })
  it('leaves an exact right angle unchanged', () => {
    expect(nearestRightAngle(HALF_PI)).toBeCloseTo(HALF_PI)
  })
})

describe('isOffSquare', () => {
  it('is false at right angles, true off them', () => {
    expect(isOffSquare(0)).toBe(false)
    expect(isOffSquare(HALF_PI)).toBe(false)
    expect(isOffSquare(0.4)).toBe(true)
  })
})
