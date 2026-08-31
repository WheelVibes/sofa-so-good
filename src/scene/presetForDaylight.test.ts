import { describe, expect, it } from 'vitest'
import { BACKDROP_PRESETS, type BackdropHour, presetForDaylight } from './backdropEquirect'

// altitudeCurve `sunColor`: alt 30 → [1, 0.96, 0.88]; alt 0 → [1, 0.72, 0.42].
const NOON: BackdropHour = { daylight: 1, lowSun: 0, tint: [1, 0.96, 0.88] }
const GOLDEN: BackdropHour = { daylight: 1, lowSun: 0.45, tint: [1, 0.85, 0.65] }
const NIGHT: BackdropHour = { daylight: 0, lowSun: 1, tint: [1, 0.72, 0.42] }

const lum = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}
const warmth = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) / Math.max(1, n & 255)
}

describe('presetForDaylight — a photo backdrop that tracks the clock', () => {
  it('is the IDENTITY at midday, so the shipped look cannot move', () => {
    for (const p of Object.values(BACKDROP_PRESETS)) expect(presetForDaylight(p, NOON)).toBe(p)
  })

  it('warms the palette at GOLDEN HOUR, while the sun is still well above 0°', () => {
    // The measured defect: at 18:00 (sun 16° up) `city` rendered COOLER than the
    // interior in front of it. `daylightFromAltitude` reports 1.0 there, so the
    // warm shift has to be driven by `lowSun`, not by the night ramp.
    const city = BACKDROP_PRESETS.city
    const golden = presetForDaylight(city, GOLDEN)
    expect(golden).not.toBe(city)
    for (const i of [0, 1, 2]) expect(warmth(golden.sky[i])).toBeGreaterThan(warmth(city.sky[i]))
    expect(warmth(golden.haze)).toBeGreaterThan(warmth(city.haze))
  })

  it('barely dims at golden hour — the big dim belongs to night', () => {
    // A warm shift costs a little luminance (green and blue come down), but the
    // deliberate dimming is driven by `daylight`, which is still 1 at 18:00.
    const city = BACKDROP_PRESETS.city
    const base = lum(city.sky[0])
    expect(lum(presetForDaylight(city, GOLDEN).sky[0])).toBeGreaterThan(base * 0.9)
    expect(lum(presetForDaylight(city, NIGHT).sky[0])).toBeLessThan(base * 0.6)
  })

  it('lights the tower windows only as the day ends', () => {
    const p = BACKDROP_PRESETS.city
    expect(presetForDaylight(p, NOON).litScale).toBe(p.litScale)
    expect(presetForDaylight(p, GOLDEN).litScale).toBeCloseTo(p.litScale as number, 5)
    expect(presetForDaylight(p, NIGHT).litScale as number).toBeGreaterThan(p.litScale as number)
  })

  it('leaves a preset with no lit windows undefined rather than NaN', () => {
    expect(presetForDaylight(BACKDROP_PRESETS.park, NIGHT).litScale).toBeUndefined()
  })

  it('never emits a malformed colour, and survives nonsense input', () => {
    const bad: BackdropHour[] = [
      { daylight: Number.NaN, lowSun: Number.NaN, tint: [1, 1, 1] },
      { daylight: -3, lowSun: 7, tint: [0, 0, 0] },
      NIGHT,
      GOLDEN,
    ]
    for (const h of bad) {
      const out = presetForDaylight(BACKDROP_PRESETS.dusk, h)
      for (const hex of [...out.sky, ...out.ground, out.haze]) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
