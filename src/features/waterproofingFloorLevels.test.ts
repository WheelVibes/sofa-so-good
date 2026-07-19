/**
 * Feature-flag tests for `waterproofing` (BSJ-7) + `floorLevels` (BSJ-8).
 * Verifies: pro tier, default on, hidden in Simple mode, present in Pro.
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from './featureFlags'

describe.each(['waterproofing', 'floorLevels'] as const)('%s feature flag', (name) => {
  it('is defined in the registry with tier=pro and default=true', () => {
    const flag = FEATURE_FLAGS[name]
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is hidden in Simple mode (tier:pro forces off in Simple)', () => {
    expect(resolveFlags(false, {}, false, 'simple')[name]).toBe(false)
  })

  it('is visible in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro')[name]).toBe(true)
  })
})
