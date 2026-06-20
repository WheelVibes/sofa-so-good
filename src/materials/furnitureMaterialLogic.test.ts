import { describe, expect, it } from 'vitest'
import { applianceFinish, hash01, liftedSheenRgb, sheenRough } from './furnitureMaterialLogic'

describe('hash01', () => {
  it('is deterministic for the same seed', () => {
    expect(hash01(42)).toBe(hash01(42))
    expect(hash01(0)).toBe(hash01(0))
    expect(hash01(123.456)).toBe(hash01(123.456))
  })

  it('returns values within [0, 1)', () => {
    for (let n = -50; n <= 50; n += 0.37) {
      const v = hash01(n)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('matches the reference fract(sin(n) * C) formula', () => {
    const ref = (n: number) => {
      const s = Math.sin(n * 12.9898) * 43758.5453
      return s - Math.floor(s)
    }
    for (const n of [0, 1, 1.7, 3.1, 1000.25]) {
      expect(hash01(n)).toBe(ref(n))
    }
  })

  it('spreads distinct seeds across the unit interval', () => {
    const buckets = new Array(10).fill(0)
    const count = 2000
    for (let i = 0; i < count; i++) {
      // Same kind of seed the wood/plank code feeds it (idx * k + offset).
      const v = hash01(i * 1.7 + 0.3)
      buckets[Math.min(9, Math.floor(v * 10))]++
    }
    // Every decile should see a fair share — no empty bucket, none dominant.
    for (const b of buckets) {
      expect(b).toBeGreaterThan(count / 10 / 3)
      expect(b).toBeLessThan((count / 10) * 3)
    }
  })

  it('produces different values for distinct seeds (no constant)', () => {
    const a = hash01(1)
    const b = hash01(2)
    const c = hash01(3)
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
  })
})

describe('sheenRough', () => {
  it('returns the base roughness at sheen 0', () => {
    expect(sheenRough(0.95, 0)).toBe(0.95)
    expect(sheenRough(0.42, 0)).toBe(0.42)
  })

  it('drives toward the gloss floor (0.04) at sheen 1', () => {
    expect(sheenRough(0.95, 1)).toBeCloseTo(0.04, 12)
    expect(sheenRough(0.5, 1)).toBeCloseTo(0.04, 12)
  })

  it('interpolates linearly between base and 0.04', () => {
    // 0.5 → midpoint of base and 0.04.
    expect(sheenRough(0.5, 0.5)).toBeCloseTo((0.5 + 0.04) / 2, 12)
    expect(sheenRough(0.8, 0.25)).toBeCloseTo(0.8 * 0.75 + 0.04 * 0.25, 12)
  })

  it('clamps sheen below 0 to 0 (base) and above 1 to 1 (gloss floor)', () => {
    expect(sheenRough(0.7, -1)).toBe(0.7)
    expect(sheenRough(0.7, 5)).toBeCloseTo(0.04, 12)
  })

  it('is monotonically non-increasing in sheen for base > 0.04', () => {
    let prev = sheenRough(0.9, 0)
    for (let s = 0.1; s <= 1; s += 0.1) {
      const cur = sheenRough(0.9, s)
      expect(cur).toBeLessThanOrEqual(prev + 1e-12)
      prev = cur
    }
  })
})

describe('applianceFinish', () => {
  it('maps steel to brushed stainless', () => {
    expect(applianceFinish('steel')).toEqual({ roughness: 0.3, metalness: 0.88 })
  })

  it('maps gloss to glossy lacquer', () => {
    expect(applianceFinish('gloss')).toEqual({ roughness: 0.12, metalness: 0.25 })
  })

  it('maps matte to the painted-matte preset', () => {
    expect(applianceFinish('matte')).toEqual({ roughness: 0.55, metalness: 0.1 })
  })

  it('falls back to the matte preset for unknown / empty finishes', () => {
    expect(applianceFinish('unknown')).toEqual({ roughness: 0.55, metalness: 0.1 })
    expect(applianceFinish('')).toEqual({ roughness: 0.55, metalness: 0.1 })
    expect(applianceFinish('STEEL')).toEqual({ roughness: 0.55, metalness: 0.1 })
  })

  it('returns fresh objects (no shared mutable preset leak)', () => {
    const a = applianceFinish('steel')
    const b = applianceFinish('steel')
    expect(a).not.toBe(b)
    a.roughness = 99
    expect(b.roughness).toBe(0.3)
  })
})

describe('liftedSheenRgb', () => {
  it('returns the input unchanged at amount 0', () => {
    expect(liftedSheenRgb([0.2, 0.4, 0.6], 0)).toEqual([0.2, 0.4, 0.6])
  })

  it('returns pure white at amount 1', () => {
    expect(liftedSheenRgb([0, 0.5, 0.9], 1)).toEqual([1, 1, 1])
  })

  it('lerps each component halfway at amount 0.5', () => {
    const [r, g, b] = liftedSheenRgb([0, 0.4, 1], 0.5)
    expect(r).toBeCloseTo(0.5, 12)
    expect(g).toBeCloseTo(0.7, 12)
    expect(b).toBeCloseTo(1, 12)
  })

  it('clamps amount below 0 to 0 (no change)', () => {
    expect(liftedSheenRgb([0.3, 0.3, 0.3], -2)).toEqual([0.3, 0.3, 0.3])
  })

  it('clamps amount above 1 to 1 (full white)', () => {
    expect(liftedSheenRgb([0.1, 0.2, 0.3], 5)).toEqual([1, 1, 1])
  })

  it('matches the lerp-toward-white formula three.js Color.lerp performs', () => {
    const rgb: [number, number, number] = [0.12, 0.34, 0.56]
    const t = 0.37
    const [r, g, b] = liftedSheenRgb(rgb, t)
    expect(r).toBeCloseTo(rgb[0] + (1 - rgb[0]) * t, 12)
    expect(g).toBeCloseTo(rgb[1] + (1 - rgb[1]) * t, 12)
    expect(b).toBeCloseTo(rgb[2] + (1 - rgb[2]) * t, 12)
  })
})
