import { describe, expect, it } from 'vitest'
import {
  AO,
  clampExposure,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAPPING,
  EXPOSURE_MAX,
  EXPOSURE_MIN,
  grade,
  SOFT_SHADOW,
  TONE_MAPPING_MODES,
  toneExposureBias,
} from './look'

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

describe('tone mapping look', () => {
  it('defaults to filmic (no regression from the historical ACES look)', () => {
    expect(DEFAULT_TONE_MAPPING).toBe('filmic')
    expect(TONE_MAPPING_MODES).toContain('filmic')
  })

  it('gives a positive exposure bias for every mode, boosting only AgX', () => {
    for (const m of TONE_MAPPING_MODES) expect(toneExposureBias(m)).toBeGreaterThan(0)
    // AgX maps middle-grey lower than ACES, so it needs a brightness boost;
    // filmic/neutral track the historical exposure (bias 1).
    expect(toneExposureBias('agx')).toBeGreaterThan(1)
    expect(toneExposureBias('filmic')).toBeCloseTo(1)
    expect(toneExposureBias('neutral')).toBeCloseTo(1)
  })

  it('clampExposure keeps the user multiplier in range + neutral by default', () => {
    expect(DEFAULT_EXPOSURE).toBe(1)
    expect(clampExposure(1)).toBe(1)
    expect(clampExposure(99)).toBe(EXPOSURE_MAX)
    expect(clampExposure(-5)).toBe(EXPOSURE_MIN)
    expect(clampExposure(Number.NaN)).toBe(DEFAULT_EXPOSURE)
    expect(EXPOSURE_MIN).toBeLessThan(1)
    expect(EXPOSURE_MAX).toBeGreaterThan(1)
  })
})
