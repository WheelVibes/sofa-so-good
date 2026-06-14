import { describe, expect, it } from 'vitest'
import { skylineLayout } from './photoSkyline'

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
