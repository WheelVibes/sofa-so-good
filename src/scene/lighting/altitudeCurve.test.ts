import { describe, expect, it } from 'vitest'
import { lightingFromAltitude, skyFromAltitude } from './altitudeCurve'

const DEG = Math.PI / 180

describe('lightingFromAltitude', () => {
  it('the beam FALLS with altitude instead of clamping above 30° (item `(z3)`)', () => {
    // Was `high overhead (alt >= 30°) returns full bright values`, asserting sun 1.0 at 45°. That
    // encoded the defect `v0.31.7.256` measured: the table's top key was 30°, so `bracket()`
    // returned it for every altitude to 90° and the beam was constant across a range where air
    // mass halves. Measured consequence: the east wall of `livingDining` rendered at 1.445 of a
    // Cycles reference at 17:00 against 0.974 at 13:00.
    //
    // 45° now carries the Kasten-Young beam normalised to 85° (0.903), and the sun keeps FULL
    // strength only near the zenith — where 13:00's validated 0.974 measurement sits.
    expect(lightingFromAltitude(85 * DEG).sun).toBeCloseTo(1.0, 2)
    const v = lightingFromAltitude(45 * DEG)
    expect(v.sun).toBeCloseTo(0.903, 2)
    expect(lightingFromAltitude(30 * DEG).sun).toBeCloseTo(0.781, 2)
    // Monotonic in altitude, which is the property the old 10° key (0.85) would have broken once
    // 30° came down to 0.781 — the sun would have brightened as it set.
    for (const [hi, lo] of [
      [85, 45],
      [45, 30],
      [30, 10],
      [10, 0],
    ] as const) {
      expect(lightingFromAltitude(hi * DEG).sun).toBeGreaterThan(lightingFromAltitude(lo * DEG).sun)
    }
    expect(v.ambient).toBeCloseTo(0.6, 2)
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2)
    expect(v.sunColor[1]).toBeCloseTo(0.96, 2)
    expect(v.sunColor[2]).toBeCloseTo(0.88, 2)
    // Daytime hemisphere sky tint reads cool/blue (blue > red).
    expect(v.skyColor[2]).toBeGreaterThan(v.skyColor[0])
  })

  it('horizon (alt = 0) keeps a DIM warm beam — the one deliberate departure from physics', () => {
    const v = lightingFromAltitude(0)
    // 0.10, down from 0.4. Air mass at the horizon is 37.9, so the beam column says ~0.000 — but
    // the golden `sunColor` below is a chosen sunset, and deleting the beam that carries it would
    // delete the look. This value is a look call, not a measurement, and is flagged as one where
    // the key is defined.
    expect(v.sun).toBeCloseTo(0.1, 2)
    expect(v.ambient).toBeCloseTo(0.4, 2)
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2)
    expect(v.sunColor[1]).toBeCloseTo(0.72, 2)
    expect(v.sunColor[2]).toBeCloseTo(0.42, 2)
  })

  it('civil twilight (alt = -6°) returns dim dusk values', () => {
    const v = lightingFromAltitude(-6 * DEG)
    expect(v.sun).toBeCloseTo(0.05, 2)
    expect(v.ambient).toBeCloseTo(0.18, 2)
  })

  it('deep night (alt ≤ -12°) returns night floor', () => {
    const v = lightingFromAltitude(-30 * DEG)
    expect(v.sun).toBeCloseTo(0, 2)
    expect(v.ambient).toBeCloseTo(0.12, 2)
  })

  it('linearly interpolates between adjacent keyframes', () => {
    // Halfway between alt=0 (sun=0.1) and alt=10° (sun=0.318)
    const v = lightingFromAltitude(5 * DEG)
    expect(v.sun).toBeCloseTo((0.1 + 0.318) / 2, 2)
  })

  it('clamps at the high end (alt > 85°), not at 30°', () => {
    // The clamp still exists — it just sits at the zenith now, where a beam genuinely stops
    // changing, rather than at 30° where it has a fifth of its range left to travel.
    const a = lightingFromAltitude(89 * DEG)
    const b = lightingFromAltitude(85 * DEG)
    expect(a.sun).toBeCloseTo(b.sun, 5)
    expect(a.ambient).toBeCloseTo(b.ambient, 5)
    // And 60° must NOT equal 30° any more, which is the whole point.
    expect(lightingFromAltitude(60 * DEG).sun).toBeGreaterThan(
      lightingFromAltitude(30 * DEG).sun + 0.05,
    )
  })
})

describe('skyFromAltitude', () => {
  it('produces day-like sky parameters at high altitude', () => {
    const v = skyFromAltitude(45 * DEG)
    expect(v.turbidity).toBeCloseTo(5, 1)
    expect(v.rayleigh).toBeCloseTo(1, 1)
  })

  it('produces dusk-like sky parameters near the horizon', () => {
    const v = skyFromAltitude(0)
    expect(v.turbidity).toBeGreaterThan(6)
    expect(v.rayleigh).toBeGreaterThan(2)
  })

  it('produces night sky parameters when sun is well below horizon', () => {
    const v = skyFromAltitude(-30 * DEG)
    expect(v.turbidity).toBeCloseTo(10, 1)
    expect(v.rayleigh).toBeLessThan(0.5)
  })
})
