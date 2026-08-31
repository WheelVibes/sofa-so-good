import { describe, expect, it } from 'vitest'
import { daylightFromAltitude } from './altitudeCurve'

const deg = (d: number) => (d * Math.PI) / 180

/**
 * DAYLIGHT-GLASS (v0.31.5.127) — the window glass must read the SUN, not the lamps.
 *
 * `windowTransmission`, `glassSkyCatchIntensity` and the `GLASS_DAY`/`GLASS_NIGHT`
 * lerp all take a `daylight` argument. Both window renderers used to pass
 * `1 - getFixtureGlow()`, which is the lamp switch, so the glass went to its night
 * look whenever the lights were on — including at midday, which is the shipped
 * default for every new visitor (`ensureDaylightFirstPaint`).
 */
describe('daylightFromAltitude', () => {
  it('is full daylight with the sun well up', () => {
    expect(daylightFromAltitude(deg(82))).toBe(1)
    expect(daylightFromAltitude(deg(30))).toBe(1)
    expect(daylightFromAltitude(deg(8))).toBe(1)
  })

  it('is fully dark at and below civil dusk (-8 degrees)', () => {
    expect(daylightFromAltitude(deg(-8))).toBe(0)
    expect(daylightFromAltitude(deg(-20))).toBe(0)
  })

  it('ramps linearly through the twilight band', () => {
    expect(daylightFromAltitude(deg(0))).toBeCloseTo(1, 10)
    expect(daylightFromAltitude(deg(-4))).toBeCloseTo(0.5, 10)
    expect(daylightFromAltitude(deg(-6))).toBeCloseTo(0.25, 10)
  })

  // The whole point of the change: the factor cannot depend on lamp state, so a
  // value taken at one hour is the same whatever the switch says.
  it('is monotonic in altitude and bounded to 0..1', () => {
    let prev = -1
    for (let d = -20; d <= 90; d += 1) {
      const v = daylightFromAltitude(deg(d))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(prev).toBe(1)
  })
})
