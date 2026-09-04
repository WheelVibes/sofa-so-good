import { describe, expect, it } from 'vitest'
import {
  AO,
  BLOOM,
  bloomActiveForDay,
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
  shadowFilterForTier,
  shadowParamsForFilter,
  TONE_MAPPING_MODES,
  toneExposureBias,
  VSM_SHADOW,
  windowFillAttenuation,
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
  // TONE-CURVE-CHOICE: the default moved off ACES Filmic. Measured whole-frame,
  // filmic -> AgX cut blown-to-white pixels 1.94% -> 0.28% at every hour in both
  // view modes, and removed the ~0.21 of saturation the per-channel curve was
  // adding to warm mid-dark surfaces. Filmic remains an explicit user choice.
  it('defaults to AgX, and keeps filmic selectable', () => {
    expect(DEFAULT_TONE_MAPPING).toBe('agx')
    expect(TONE_MAPPING_MODES).toContain('filmic')
    expect(TONE_MAPPING_MODES).toContain('agx')
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

describe('shadowFilterForTier (PHOTO-SOFTSHADOW)', () => {
  it('keeps the flat Performance tier on PCF (it renders shadowless anyway)', () => {
    expect(shadowFilterForTier('performance', 'weak')).toBe('pcf')
  })

  it('gives every variant that HAS a shadow map VSM soft shadows', () => {
    // Parity with the retired ladder: old medium/high/maximum all rendered VSM,
    // and those are these three.
    expect(shadowFilterForTier('performance', 'capable')).toBe('vsm')
    expect(shadowFilterForTier('realistic', 'weak')).toBe('vsm')
    expect(shadowFilterForTier('realistic', 'capable')).toBe('vsm')
  })
})

describe('shadowParamsForFilter', () => {
  it('pairs VSM with the VSM tuning (real blur radius + samples)', () => {
    const p = shadowParamsForFilter('vsm')
    expect(p).toEqual(VSM_SHADOW)
    expect(p.radius).toBeGreaterThan(1)
    expect(p.blurSamples).toBeGreaterThanOrEqual(8)
  })

  it('pairs PCF with the historical SOFT_SHADOW tuning', () => {
    const p = shadowParamsForFilter('pcf')
    expect(p.radius).toBe(SOFT_SHADOW.radius)
    expect(p.bias).toBe(SOFT_SHADOW.bias)
    expect(p.normalBias).toBe(SOFT_SHADOW.normalBias)
  })

  it('keeps a small anti-acne bias on both filters', () => {
    for (const f of ['pcf', 'vsm'] as const) {
      const p = shadowParamsForFilter(f)
      expect(p.bias).toBeLessThan(0)
      expect(p.normalBias).toBeGreaterThan(0)
    }
  })
})

describe('bloomActiveForDay', () => {
  it('is off at full daylight, where the ramp has zeroed the intensity', () => {
    // Daylight must mount NO bloom pass — an intensity-zeroed Bloom still runs
    // its blur chain and still feeds the composer's combined effect shader.
    expect(bloomActiveForDay(1)).toBe(false)
  })

  it('is on at night, where emissive fixtures need to glow', () => {
    expect(bloomActiveForDay(0)).toBe(true)
  })

  it('is on through the twilight ramp', () => {
    expect(bloomActiveForDay(0.5)).toBe(true)
    expect(bloomActiveForDay(0.99)).toBe(true)
  })

  it('agrees with the intensity ramp it gates', () => {
    for (const d of [0, 0.1, 0.5, 0.9, 1]) {
      expect(bloomActiveForDay(d)).toBe(bloomIntensityForDay(d) > 0)
    }
  })

  it('treats out-of-range and non-finite day levels as night (fail-safe)', () => {
    expect(bloomActiveForDay(Number.NaN)).toBe(true)
    expect(bloomActiveForDay(-3)).toBe(true)
    expect(bloomActiveForDay(5)).toBe(false)
  })
})

describe('windowFillAttenuation (KEY-FILL-BALANCE)', () => {
  it('passes a clear (fully open) window through unchanged', () => {
    expect(windowFillAttenuation(1)).toBe(1)
  })

  it('passes a fully blocked window through unchanged', () => {
    expect(windowFillAttenuation(0)).toBe(0)
  })

  it('is the identity across the open range', () => {
    // The curtain feature's magnitude is unchanged by KEY-FILL-BALANCE — only
    // WHICH light it applies to moved (fill, not the shadow-casting sun).
    for (const v of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(windowFillAttenuation(v)).toBeCloseTo(v, 6)
    }
  })

  it('clamps out-of-range input', () => {
    expect(windowFillAttenuation(1.7)).toBe(1)
    expect(windowFillAttenuation(-0.4)).toBe(0)
  })

  it('treats a non-finite factor as fully open (fail bright, never black)', () => {
    expect(windowFillAttenuation(Number.NaN)).toBe(1)
    expect(windowFillAttenuation(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
