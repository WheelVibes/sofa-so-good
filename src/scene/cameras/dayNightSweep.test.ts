import { describe, expect, it } from 'vitest'
import { DEFAULT_CLIP_END_HOUR, DEFAULT_CLIP_START_HOUR, sweepHourAt } from './dayNightSweep'

describe('sweepHourAt', () => {
  it('returns the start hour at progress 0 and the end hour at progress 1', () => {
    expect(sweepHourAt(0, 8, 22)).toBe(8)
    expect(sweepHourAt(1, 8, 22)).toBe(22)
  })

  it('interpolates linearly in between', () => {
    expect(sweepHourAt(0.5, 8, 22)).toBe(15)
    expect(sweepHourAt(0.25, 8, 20)).toBe(11)
  })

  it('clamps progress into [0, 1] so an over-run frame stays at the endpoints', () => {
    expect(sweepHourAt(-0.5, 8, 22)).toBe(8)
    expect(sweepHourAt(1.5, 8, 22)).toBe(22)
  })

  it('sweeps FORWARD through midnight when the end is at/before the start', () => {
    // 20:00 → 06:00 must go 20 → 21 → … → 0 → … → 6 (forward), not rewind.
    // Midpoint of a 10 h forward span from 20 is 20 + 5 = 25 → wraps to 1am.
    expect(sweepHourAt(0.5, 20, 6)).toBe(1)
    expect(sweepHourAt(1, 20, 6)).toBe(6)
    // Exactly-equal endpoints lift by 24 → a full loop, ending back at start.
    expect(sweepHourAt(0, 12, 12)).toBe(12)
    expect(sweepHourAt(1, 12, 12)).toBe(12)
  })

  it('always returns an hour in [0, 24)', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const h = sweepHourAt(p, 22, 5)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(24)
    }
  })

  it('exposes sensible day→night defaults', () => {
    expect(DEFAULT_CLIP_START_HOUR).toBe(8)
    expect(DEFAULT_CLIP_END_HOUR).toBe(22)
    expect(DEFAULT_CLIP_START_HOUR).toBeLessThan(DEFAULT_CLIP_END_HOUR)
  })
})
