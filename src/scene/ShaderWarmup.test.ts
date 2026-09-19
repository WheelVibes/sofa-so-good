import { describe, expect, it } from 'vitest'
import {
  formatBackdropWarmupProbe,
  formatWalkCensusWarmupProbe,
  shouldWarmWalkLightCensus,
} from './ShaderWarmup'

describe('formatBackdropWarmupProbe (BACKDROP-WARMUP probe log)', () => {
  it('formats the exact shape a log scraper expects: "[probe] backdrop-warmup <ms> <programsAdded>"', () => {
    expect(formatBackdropWarmupProbe(1.2, 2)).toBe('[probe] backdrop-warmup 1.2 2')
  })

  it('rounds ms to one decimal', () => {
    expect(formatBackdropWarmupProbe(1.23456, 1)).toBe('[probe] backdrop-warmup 1.2 1')
    expect(formatBackdropWarmupProbe(1.26, 1)).toBe('[probe] backdrop-warmup 1.3 1')
  })

  it('is exact for whole-number ms (no trailing .0 noise beyond what toFixed-style rounding gives)', () => {
    expect(formatBackdropWarmupProbe(0, 0)).toBe('[probe] backdrop-warmup 0 0')
    expect(formatBackdropWarmupProbe(5, 3)).toBe('[probe] backdrop-warmup 5 3')
  })

  it('reports zero or negative programsAdded honestly (e.g. a cache hit on a later boot)', () => {
    expect(formatBackdropWarmupProbe(0.4, 0)).toBe('[probe] backdrop-warmup 0.4 0')
  })
})

describe('formatWalkCensusWarmupProbe (WALK-LIGHT-CENSUS-WARMUP probe log)', () => {
  it('formats the exact shape a log scraper expects: "[probe] walk-census-warmup <ms> <programsAdded>"', () => {
    expect(formatWalkCensusWarmupProbe(12.3, 34)).toBe('[probe] walk-census-warmup 12.3 34')
  })

  it('rounds ms to one decimal', () => {
    expect(formatWalkCensusWarmupProbe(1.23456, 1)).toBe('[probe] walk-census-warmup 1.2 1')
    expect(formatWalkCensusWarmupProbe(1.26, 1)).toBe('[probe] walk-census-warmup 1.3 1')
  })

  it('reports zero programsAdded honestly (e.g. no studio key mounted, or a cache hit)', () => {
    expect(formatWalkCensusWarmupProbe(0.4, 0)).toBe('[probe] walk-census-warmup 0.4 0')
  })
})

describe('shouldWarmWalkLightCensus (pure decision, WALK-LIGHT-CENSUS-WARMUP)', () => {
  it('warms when the registry holds a light instance', () => {
    expect(shouldWarmWalkLightCensus({ visible: true })).toBe(true)
  })

  it('does not warm when the registry is empty — walk mode already, flag off, or a weak tier', () => {
    expect(shouldWarmWalkLightCensus(null)).toBe(false)
    expect(shouldWarmWalkLightCensus(undefined)).toBe(false)
  })
})
