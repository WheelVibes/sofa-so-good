import { describe, expect, it } from 'vitest'
import { formatBackdropWarmupProbe } from './ShaderWarmup'

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
