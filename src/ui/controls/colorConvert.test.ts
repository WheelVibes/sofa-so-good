import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex } from './colorConvert'

describe('colorConvert', () => {
  it('converts primaries hex → HSV', () => {
    expect(hexToHsv('#ff0000')).toMatchObject({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00')).toMatchObject({ h: 120, s: 1, v: 1 })
    expect(hexToHsv('#0000ff')).toMatchObject({ h: 240, s: 1, v: 1 })
  })

  it('handles black / white / grey', () => {
    expect(hexToHsv('#000000')).toMatchObject({ s: 0, v: 0 })
    expect(hexToHsv('#ffffff')).toMatchObject({ s: 0, v: 1 })
    const grey = hexToHsv('#808080')
    expect(grey?.s).toBe(0)
    expect(grey?.v).toBeCloseTo(0.5, 1)
  })

  it('returns null for invalid hex', () => {
    expect(hexToHsv('nope')).toBeNull()
    expect(hexToHsv('')).toBeNull()
  })

  it('hsvToHex produces the expected primaries', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00')
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff')
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe('#000000')
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#ffffff')
  })

  it('round-trips a range of hexes within rounding tolerance', () => {
    for (const hex of ['#3b82f6', '#e11d48', '#10b981', '#a78bfa', '#ecdfce', '#251f1b']) {
      const hsv = hexToHsv(hex)
      expect(hsv).not.toBeNull()
      expect(hsvToHex(hsv!)).toBe(hex)
    }
  })

  it('wraps out-of-range hue and clamps s/v', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000ff')
    expect(hsvToHex({ h: 0, s: 2, v: 2 })).toBe('#ff0000')
  })
})
