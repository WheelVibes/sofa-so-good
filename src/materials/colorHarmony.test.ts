import { describe, expect, it } from 'vitest'
import { hexToHsl, hslToHex, normalizeHex, recommendedBlends } from './colorHarmony'

describe('normalizeHex', () => {
  it('expands #rgb, lower-cases, and drops alpha', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHex('#aabbccdd')).toBe('#aabbcc')
  })
  it('rejects non-hex', () => {
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('#zzzzzz')).toBeNull()
    expect(normalizeHex('')).toBeNull()
  })
})

describe('hex ↔ hsl round-trip', () => {
  it('round-trips primary + neutral colours within rounding', () => {
    for (const hex of [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#808080',
      '#123456',
      '#ffffff',
      '#000000',
    ]) {
      const hsl = hexToHsl(hex)
      expect(hsl).not.toBeNull()
      expect(hslToHex(hsl!)).toBe(hex)
    }
  })
  it('wraps hue and clamps s/l out of range', () => {
    expect(hslToHex({ h: 420, s: 1, l: 0.5 })).toBe(hslToHex({ h: 60, s: 1, l: 0.5 }))
    expect(hslToHex({ h: 0, s: 2, l: -1 })).toBe('#000000')
  })
})

describe('recommendedBlends', () => {
  it('returns [] for an empty / all-invalid palette', () => {
    expect(recommendedBlends([])).toEqual([])
    expect(recommendedBlends(['nope', 'also-bad'])).toEqual([])
  })

  it('derives harmonious colours from a single base (incl. the complement)', () => {
    const blends = recommendedBlends(['#3366cc'])
    expect(blends.length).toBeGreaterThan(0)
    expect(blends.length).toBeLessThanOrEqual(10)
    // All outputs are valid normalised hex.
    for (const b of blends) expect(normalizeHex(b)).toBe(b)
    // The complementary colour leads (opposite hue, ~same s/l).
    const base = hexToHsl('#3366cc')!
    const comp = hexToHsl(blends[0])!
    const diff = (((comp.h - base.h) % 360) + 360) % 360 // 0..360 hue separation
    expect(Math.abs(diff - 180)).toBeLessThan(5) // within 5° of exact complement
  })

  it('never includes a colour already in the palette and dedupes', () => {
    const palette = ['#3366cc', '#cc6633']
    const blends = recommendedBlends(palette)
    const set = new Set(palette.map((p) => normalizeHex(p)))
    for (const b of blends) expect(set.has(b)).toBe(false)
    expect(new Set(blends).size).toBe(blends.length)
  })

  it('caps at the requested maximum and is deterministic', () => {
    const palette = ['#3366cc', '#cc6633', '#33cc66', '#cc33aa', '#aacc33']
    const a = recommendedBlends(palette, 10)
    const b = recommendedBlends(palette, 10)
    expect(a.length).toBeLessThanOrEqual(10)
    expect(a).toEqual(b)
  })

  it('updates when the palette changes (dynamic harmony)', () => {
    expect(recommendedBlends(['#3366cc'])).not.toEqual(recommendedBlends(['#cc3333']))
  })
})
