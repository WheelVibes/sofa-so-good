import { describe, expect, it } from 'vitest'
import {
  FLY_MAX_SECONDS,
  FLY_MIN_SECONDS,
  flyDurationFor,
  smoothstep,
  type Vec3,
} from './cameraTween'

describe('cameraTween — smoothstep', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6)
  })

  it('clamps out-of-range inputs', () => {
    expect(smoothstep(-1)).toBe(0)
    expect(smoothstep(2)).toBe(1)
  })

  it('eases in and out (slower than linear near the ends)', () => {
    // Below the line early, above it late — the S-curve.
    expect(smoothstep(0.25)).toBeLessThan(0.25)
    expect(smoothstep(0.75)).toBeGreaterThan(0.75)
  })

  it('is monotonic across the unit interval', () => {
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const v = smoothstep(i / 20)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('cameraTween — flyDurationFor', () => {
  const origin: Vec3 = [0, 0, 0]

  it('uses the minimum duration for a zero-length move', () => {
    expect(flyDurationFor(origin, origin)).toBe(FLY_MIN_SECONDS)
  })

  it('stays near the minimum for a tiny hop', () => {
    const dur = flyDurationFor(origin, [0.3, 0, 0])
    expect(dur).toBeGreaterThanOrEqual(FLY_MIN_SECONDS)
    expect(dur).toBeLessThan(FLY_MIN_SECONDS + 0.05)
  })

  it('saturates at the maximum for a long jump', () => {
    expect(flyDurationFor(origin, [100, 0, 0])).toBe(FLY_MAX_SECONDS)
  })

  it('scales monotonically with distance and stays within bounds', () => {
    let prev = 0
    for (let d = 0; d <= 25; d += 2.5) {
      const dur = flyDurationFor(origin, [d, 0, 0])
      expect(dur).toBeGreaterThanOrEqual(FLY_MIN_SECONDS)
      expect(dur).toBeLessThanOrEqual(FLY_MAX_SECONDS)
      expect(dur).toBeGreaterThanOrEqual(prev)
      prev = dur
    }
  })

  it('falls back to the minimum for a non-finite pose', () => {
    expect(flyDurationFor(origin, [Number.NaN, 0, 0])).toBe(FLY_MIN_SECONDS)
  })

  it('measures full 3-D travel (not just one axis)', () => {
    // A diagonal move is longer than the same delta on one axis → longer/equal.
    const axis = flyDurationFor(origin, [5, 0, 0])
    const diag = flyDurationFor(origin, [5, 5, 5])
    expect(diag).toBeGreaterThan(axis)
  })
})
