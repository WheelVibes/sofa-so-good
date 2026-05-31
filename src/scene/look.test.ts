import { describe, expect, it } from 'vitest'
import { AO, grade, SOFT_SHADOW } from './look'

describe('grade', () => {
  it('exposure rises monotonically with sun altitude', () => {
    const night = grade(-0.3).exposure
    const dawn = grade(0.05).exposure
    const noon = grade(1.2).exposure
    expect(night).toBeLessThan(dawn)
    expect(dawn).toBeLessThan(noon)
  })

  it('clamps exposure to a sane range', () => {
    for (const alt of [-1.5, -0.2, 0, 0.4, 1.57]) {
      const e = grade(alt).exposure
      expect(e).toBeGreaterThanOrEqual(0.7)
      expect(e).toBeLessThanOrEqual(1.25)
    }
  })

  it('white balance is warmer (lower kelvin factor) near the horizon', () => {
    expect(grade(0.03).warmth).toBeGreaterThan(grade(1.2).warmth)
    // peak warmth sits just above the horizon, not at night or midday
    expect(grade(0.08).warmth).toBeGreaterThan(grade(0.03).warmth)
    expect(grade(0.08).warmth).toBeGreaterThan(grade(1.2).warmth)
  })

  it('exposes tuned shadow + AO constants', () => {
    expect(SOFT_SHADOW.radius).toBeGreaterThan(0)
    expect(SOFT_SHADOW.normalBias).toBeGreaterThan(0)
    expect(SOFT_SHADOW.bias).toBeLessThan(0)
    expect(AO.aoRadius).toBeGreaterThan(0)
    expect(AO.distanceFalloff).toBeGreaterThan(0)
    expect(AO.intensity).toBeGreaterThan(0)
  })
})
