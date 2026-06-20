import { describe, expect, it } from 'vitest'
import { BLOOM } from '../look'
import {
  BLOOM_LUMINANCE_THRESHOLD,
  type FixtureRole,
  fixtureEmissiveIntensity,
  getFixtureGlow,
  setFixtureGlow,
} from './fixtureGlow'

// The Bloom luminance threshold in EffectsImpl — lit fixtures must clear it so
// they bloom on High/Max (and read self-lit on the flat tier).
const BLOOM_THRESHOLD = BLOOM_LUMINANCE_THRESHOLD
const ROLES: FixtureRole[] = ['shade', 'bulb', 'strip']

describe('fixtureEmissiveIntensity', () => {
  it('the mirrored threshold stays in lock-step with look.BLOOM (no drift)', () => {
    expect(BLOOM_LUMINANCE_THRESHOLD).toBe(BLOOM.luminanceThreshold)
  })

  it('peaks clear the bloom threshold with margin at full darkness for every role', () => {
    for (const role of ROLES) {
      // Margin (not just >) so a slightly graded-down night still blooms.
      expect(fixtureEmissiveIntensity(role, 1)).toBeGreaterThan(BLOOM_THRESHOLD + 0.15)
    }
  })

  it('stays dark in daylight (glow 0) so fixtures go off in the sun', () => {
    for (const role of ROLES) {
      expect(fixtureEmissiveIntensity(role, 0)).toBeLessThan(0.2)
    }
  })

  it('ramps monotonically with glow', () => {
    for (const role of ROLES) {
      expect(fixtureEmissiveIntensity(role, 0.5)).toBeGreaterThan(fixtureEmissiveIntensity(role, 0))
      expect(fixtureEmissiveIntensity(role, 1)).toBeGreaterThan(fixtureEmissiveIntensity(role, 0.5))
    }
  })

  it('a bare bulb glows hotter than a diffusing shade', () => {
    expect(fixtureEmissiveIntensity('bulb', 1)).toBeGreaterThan(
      fixtureEmissiveIntensity('shade', 1),
    )
  })

  it('reads the live glow singleton when no level is passed', () => {
    const prev = getFixtureGlow()
    setFixtureGlow(1)
    expect(fixtureEmissiveIntensity('shade')).toBeCloseTo(fixtureEmissiveIntensity('shade', 1))
    setFixtureGlow(prev)
  })
})
