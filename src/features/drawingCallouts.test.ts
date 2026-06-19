/**
 * Feature-flag tests for `drawingCallouts` (PARITY-LIGHTINGTEMPLATE-TEXT).
 * Verifies: hidden in Simple mode, present in Pro mode — as required by the
 * hard rule for pro-tier features.
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from './featureFlags'

describe('drawingCallouts feature flag', () => {
  it('is defined in the registry with tier=pro and default=true', () => {
    const flag = FEATURE_FLAGS['drawingCallouts']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is hidden in Simple mode (tier:pro forces off in Simple)', () => {
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    const flags = resolveFlags(false, {}, false, 'simple')
    expect(flags.drawingCallouts).toBe(false)
  })

  it('is visible in Pro mode', () => {
    const flags = resolveFlags(false, {}, false, 'pro')
    expect(flags.drawingCallouts).toBe(true)
  })
})
