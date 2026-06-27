/**
 * Feature-flag tests for `smartRotateSnap` (PARITY-SNAP-ROTATE).
 * Verifies: hidden in Simple mode (where the familiar 15° snap is the only
 * rotation behaviour), present in Pro mode — as required by the hard rule for
 * pro-tier features.
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from './featureFlags'

describe('smartRotateSnap feature flag', () => {
  it('is defined in the registry with tier=pro and default=true', () => {
    const flag = FEATURE_FLAGS['smartRotateSnap']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is hidden in Simple mode (tier:pro forces off → plain 15° snap)', () => {
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    const flags = resolveFlags(false, {}, false, 'simple')
    expect(flags.smartRotateSnap).toBe(false)
  })

  it('is enabled in Pro mode', () => {
    const flags = resolveFlags(false, {}, false, 'pro')
    expect(flags.smartRotateSnap).toBe(true)
  })
})
