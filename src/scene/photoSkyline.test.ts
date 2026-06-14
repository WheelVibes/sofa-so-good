import { describe, expect, it } from 'vitest'
import { skylineLayout, skyPalette } from './photoSkyline'

describe('skyPalette', () => {
  const finite = (c: number[]) => c.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)

  it('returns the night palette below the horizon and day palette high up', () => {
    const night = skyPalette(-0.5)
    const day = skyPalette(1.2)
    expect(night.windowLit).toBe(1)
    expect(day.windowLit).toBeLessThan(0.2)
    // Night zenith is much darker than day zenith.
    expect(night.zenith[2]).toBeLessThan(day.zenith[2])
  })

  it('warms the horizon around sunset (golden) vs midday', () => {
    const golden = skyPalette(0.0) // just above horizon
    const day = skyPalette(1.0)
    // Golden horizon is warmer: more red than blue; day horizon is pale/cool.
    expect(golden.horizon[0]).toBeGreaterThan(golden.horizon[2])
    expect(day.horizon[2]).toBeGreaterThanOrEqual(day.horizon[0] - 30)
  })

  it('produces valid bounded colours + windowLit for any altitude', () => {
    for (const a of [-1, -0.1, -0.05, 0, 0.08, 0.2, 0.34, 0.6, 1.4, Number.NaN]) {
      const p = skyPalette(a)
      for (const c of [p.zenith, p.horizon, p.ground, p.buildingFar, p.buildingNear])
        expect(finite(c)).toBe(true)
      expect(p.windowLit).toBeGreaterThanOrEqual(0)
      expect(p.windowLit).toBeLessThanOrEqual(1)
    }
  })

  it('darkens the sky monotonically from day to night', () => {
    const bright = skyPalette(1.0).horizon[2]
    const dusk = skyPalette(0.0).horizon[2]
    const night = skyPalette(-0.3).horizon[2]
    expect(bright).toBeGreaterThan(night)
    expect(dusk).toBeGreaterThan(night)
  })
})

describe('skylineLayout', () => {
  it('is deterministic for a given seed', () => {
    expect(skylineLayout(0xc17)).toEqual(skylineLayout(0xc17))
  })

  it('produces farCount + nearCount buildings, far row first', () => {
    const b = skylineLayout(1, { farCount: 10, nearCount: 6 })
    expect(b).toHaveLength(16)
    expect(b.slice(0, 10).every((x) => x.layer === 0)).toBe(true)
    expect(b.slice(10).every((x) => x.layer === 1)).toBe(true)
  })

  it('keeps every building within normalised bounds', () => {
    for (const x of skylineLayout(42)) {
      expect(x.x).toBeGreaterThanOrEqual(0)
      expect(x.x).toBeLessThan(1)
      expect(x.w).toBeGreaterThan(0)
      expect(x.w).toBeLessThan(1)
      expect(x.h).toBeGreaterThan(0)
      expect(x.h).toBeLessThanOrEqual(1)
      expect(x.cols).toBeGreaterThanOrEqual(1)
      expect(x.rows).toBeGreaterThanOrEqual(2)
      expect(Number.isFinite(x.tone)).toBe(true)
    }
  })

  it('handles degenerate / zero counts without throwing', () => {
    expect(skylineLayout(0, { farCount: 0, nearCount: 0 })).toEqual([])
    expect(() => skylineLayout(0, { farCount: -5, nearCount: -1 })).not.toThrow()
    expect(skylineLayout(0, { farCount: -5, nearCount: -1 })).toEqual([])
  })

  it('makes the near row taller on average than the far row', () => {
    const b = skylineLayout(7, { farCount: 40, nearCount: 40 })
    const avg = (layer: 0 | 1) => {
      const rows = b.filter((x) => x.layer === layer)
      return rows.reduce((s, x) => s + x.h, 0) / rows.length
    }
    expect(avg(1)).toBeGreaterThan(avg(0))
  })
})
