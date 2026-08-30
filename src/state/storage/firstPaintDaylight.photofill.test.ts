import { describe, expect, it } from 'vitest'
import { firstPaintDaylight, shouldLightFirstPaint } from './firstPaintDaylight'

const SG = { lat: 1.3521, lon: 103.8198 }
/** 2026-08-31 in Singapore: 13:00 is a 82° sun, 21:00 is well after sunset. */
const NOON = new Date('2026-08-31T13:00:00+08:00')
const NIGHT = new Date('2026-08-31T21:00:00+08:00')

describe('shouldLightFirstPaint — the DEFAULT is untouched', () => {
  it('lights the flat at every hour when the flag is OFF (DEFAULT-GLOOM, .86)', () => {
    for (const d of [0, 0.5, 1]) expect(shouldLightFirstPaint(d, false)).toBe(true)
  })

  it('with the flag ON, still lights a DARK flat — the legibility case is intact', () => {
    expect(shouldLightFirstPaint(0, true)).toBe(true)
    expect(shouldLightFirstPaint(0.4, true)).toBe(true)
    expect(shouldLightFirstPaint(0.99, true)).toBe(true)
  })

  it('with the flag ON, leaves a fully daylit flat unlit — no real interior burns every lamp at 1pm', () => {
    expect(shouldLightFirstPaint(1, true)).toBe(false)
  })

  it('treats a nonsense daylight as "light it" rather than leaving a black screen', () => {
    expect(shouldLightFirstPaint(Number.NaN, true)).toBe(true)
  })
})

describe('firstPaintDaylight', () => {
  it('reads 1 at Singapore midday and 0 at night', () => {
    expect(firstPaintDaylight(NOON, SG.lat, SG.lon)).toBe(1)
    expect(firstPaintDaylight(NIGHT, SG.lat, SG.lon)).toBe(0)
  })

  it('so the flag changes the outcome at midday and not at night', () => {
    expect(shouldLightFirstPaint(firstPaintDaylight(NOON, SG.lat, SG.lon), true)).toBe(false)
    expect(shouldLightFirstPaint(firstPaintDaylight(NIGHT, SG.lat, SG.lon), true)).toBe(true)
    expect(shouldLightFirstPaint(firstPaintDaylight(NOON, SG.lat, SG.lon), false)).toBe(true)
  })
})
