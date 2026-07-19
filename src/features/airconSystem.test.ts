/**
 * Feature-flag tests for `airconSystem` (BSJ-2 aircon SYSTEM planner).
 * Verifies: pro tier, default on, hidden in Simple mode, present in Pro.
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from './featureFlags'

describe('airconSystem feature flag', () => {
  it('is defined in the registry with tier=pro and default=true', () => {
    const flag = FEATURE_FLAGS['airconSystem']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is hidden in Simple mode (tier:pro forces off in Simple)', () => {
    expect(resolveFlags(false, {}, false, 'simple').airconSystem).toBe(false)
  })

  it('is visible in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').airconSystem).toBe(true)
  })
})
