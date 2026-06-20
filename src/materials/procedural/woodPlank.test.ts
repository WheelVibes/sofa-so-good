import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAIN_LEAN, grainLean, plankHash, shearAcross } from './woodPlank'

describe('plankHash', () => {
  it('is deterministic', () => {
    expect(plankHash(42)).toBe(plankHash(42))
  })

  it('returns a value in [0, 1)', () => {
    for (let n = 0; n < 200; n++) {
      const h = plankHash(n)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('spreads across the unit range (not a constant)', () => {
    const xs = Array.from({ length: 64 }, (_, i) => plankHash(i))
    expect(Math.min(...xs)).toBeLessThan(0.25)
    expect(Math.max(...xs)).toBeGreaterThan(0.75)
  })
})

describe('grainLean', () => {
  it('is deterministic for the same seed + plank id', () => {
    expect(grainLean(7, 3)).toBe(grainLean(7, 3))
  })

  it('stays within ±maxRad', () => {
    for (let id = 0; id < 200; id++) {
      expect(Math.abs(grainLean(5, id))).toBeLessThanOrEqual(DEFAULT_GRAIN_LEAN + 1e-12)
    }
  })

  it('honours a custom maxRad', () => {
    for (let id = 0; id < 100; id++) {
      expect(Math.abs(grainLean(5, id, 0.2))).toBeLessThanOrEqual(0.2 + 1e-12)
    }
  })

  it('varies board-to-board (directional flow, not one uniform angle)', () => {
    const leans = Array.from({ length: 32 }, (_, id) => grainLean(11, id))
    const unique = new Set(leans.map((l) => l.toFixed(6)))
    // Nearly every board should get its own lean.
    expect(unique.size).toBeGreaterThan(28)
    // And it should swing to both sides of straight (some lean left, some right).
    expect(leans.some((l) => l > 0.01)).toBe(true)
    expect(leans.some((l) => l < -0.01)).toBe(true)
  })

  it('decorrelates across seeds (same id, different seed → different lean)', () => {
    expect(grainLean(1, 4)).not.toBe(grainLean(2, 4))
  })
})

describe('shearAcross', () => {
  it('leaves the plank mid-length unchanged (pivot)', () => {
    expect(shearAcross(0.3, 0.5, 0.1)).toBeCloseTo(0.3, 12)
  })

  it('tilts the band toward both ends symmetrically', () => {
    const lean = 0.08
    const head = shearAcross(0.4, 0, lean)
    const tail = shearAcross(0.4, 1, lean)
    expect(head).toBeCloseTo(0.4 - 0.5 * lean, 12)
    expect(tail).toBeCloseTo(0.4 + 0.5 * lean, 12)
  })

  it('is a no-op when the lean is zero', () => {
    expect(shearAcross(0.7, 0.2, 0)).toBe(0.7)
  })
})
