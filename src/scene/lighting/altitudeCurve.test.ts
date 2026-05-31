import { describe, expect, it } from 'vitest'
import { lightingFromAltitude, skyFromAltitude } from './altitudeCurve'

const DEG = Math.PI / 180

describe('lightingFromAltitude', () => {
  it('high overhead (alt ≥ 30°) returns full bright values', () => {
    const v = lightingFromAltitude(45 * DEG)
    expect(v.sun).toBeCloseTo(1.0, 2)
    expect(v.ambient).toBeCloseTo(0.6, 2)
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2)
    expect(v.sunColor[1]).toBeCloseTo(0.96, 2)
    expect(v.sunColor[2]).toBeCloseTo(0.88, 2)
    // Daytime hemisphere sky tint reads cool/blue (blue > red).
    expect(v.skyColor[2]).toBeGreaterThan(v.skyColor[0])
  })

  it('horizon (alt = 0) returns golden values', () => {
    const v = lightingFromAltitude(0)
    expect(v.sun).toBeCloseTo(0.4, 2)
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
    // Halfway between alt=0 (sun=0.4) and alt=10° (sun=0.85)
    const v = lightingFromAltitude(5 * DEG)
    expect(v.sun).toBeCloseTo((0.4 + 0.85) / 2, 2)
  })

  it('clamps at the high end (alt > 30°)', () => {
    const a = lightingFromAltitude(60 * DEG)
    const b = lightingFromAltitude(30 * DEG)
    expect(a.sun).toBeCloseTo(b.sun, 5)
    expect(a.ambient).toBeCloseTo(b.ambient, 5)
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
