import { describe, expect, it } from 'vitest'
import {
  AO,
  BLOOM,
  bloomIntensityForDay,
  clampExposure,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAPPING,
  EXPOSURE_MAX,
  EXPOSURE_MIN,
  grade,
  IBL_FILL_COMPENSATION,
  iblFillScale,
  SOFT_SHADOW,
  TONE_MAPPING_MODES,
  toneExposureBias,
} from './look'

describe('iblFillScale', () => {
  it('is a no-op when IBL is inactive (flat tier keeps its full fill)', () => {
    expect(iblFillScale(false, 0)).toBe(1)
    expect(iblFillScale(false, 1)).toBe(1)
  })

  it('leaves the night fill untouched (IBL near its floor)', () => {
    expect(iblFillScale(true, 0)).toBe(1)
  })

  it('reduces the fill most at midday to avoid double-counting IBL', () => {
    expect(iblFillScale(true, 1)).toBeCloseTo(1 - IBL_FILL_COMPENSATION, 5)
    expect(iblFillScale(true, 1)).toBeLessThan(iblFillScale(true, 0.5))
    expect(iblFillScale(true, 0.5)).toBeLessThan(iblFillScale(true, 0))
  })

  it('clamps a non-finite or out-of-range day level', () => {
    expect(iblFillScale(true, Number.NaN)).toBe(1)
    expect(iblFillScale(true, 5)).toBeCloseTo(1 - IBL_FILL_COMPENSATION, 5)
    expect(iblFillScale(true, -2)).toBe(1)
  })
})

describe('bloomIntensityForDay', () => {
  it('is full bloom at night (fixtures glow)', () => {
    expect(bloomIntensityForDay(0)).toBeCloseTo(BLOOM.intensity, 5)
  })

  it('falls to zero at midday (no daytime veil)', () => {
    expect(bloomIntensityForDay(1)).toBeCloseTo(0, 5)
  })

  it('decreases monotonically as the day brightens', () => {
    expect(bloomIntensityForDay(0.25)).toBeGreaterThan(bloomIntensityForDay(0.75))
  })

  it('clamps non-finite / out-of-range day levels', () => {
    expect(bloomIntensityForDay(Number.NaN)).toBeCloseTo(BLOOM.intensity, 5)
    expect(bloomIntensityForDay(5)).toBeCloseTo(0, 5)
    expect(bloomIntensityForDay(-3)).toBeCloseTo(BLOOM.intensity, 5)
  })
})

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

  it('bloom threshold clears bright daytime diffuse (above ~1.2 graded exposure)', () => {
    // The "milky maximum" fix: the threshold must sit above broad sunlit
    // surfaces (graded day exposure peaks ~1.25) so they do not bloom, while
    // staying a sane positive glow strength.
    expect(BLOOM.luminanceThreshold).toBeGreaterThan(1.25)
    expect(BLOOM.intensity).toBeGreaterThan(0)
    expect(BLOOM.intensity).toBeLessThan(1)
    expect(BLOOM.luminanceSmoothing).toBeGreaterThan(0)
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
