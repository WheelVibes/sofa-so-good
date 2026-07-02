import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the Cloudflare backend features. `accounts` (email+password
 * sign-in + cloud sync) is a core casual-user convenience → simple tier, shown
 * in BOTH modes. `sharedLibrary` (browse the cloud furniture library) is an
 * advanced catalog source → pro tier, hidden in Simple. Both are prod-safe pure
 * code (inert without a backend), so neither is devOnly. Tested in BOTH modes
 * per the CLAUDE.md hard rule.
 */
describe('accounts feature flag', () => {
  it('is registered as a simple-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.accounts
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in both Simple and Pro mode (core loop)', () => {
    expect(resolveFlags(false, {}, false, 'simple').accounts).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').accounts).toBe(true)
  })
})

describe('sharedLibrary feature flag', () => {
  it('is registered as a pro-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.sharedLibrary
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').sharedLibrary).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').sharedLibrary).toBe(false)
  })
})
