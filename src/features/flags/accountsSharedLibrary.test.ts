import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the Cloudflare backend features. `accounts` (email+password
 * sign-in + cloud sync) is a core casual-user convenience → simple tier, shown
 * in BOTH modes. `sharedLibrary` (browse the cloud furniture library) is also
 * simple tier — its real gate is the **admin role** (checked at the bootstrap/
 * merge call sites via `isAdminUser`), not the Simple/Pro mode. Both are
 * prod-safe pure code (inert without a backend), so neither is devOnly. Tested
 * in BOTH modes per the CLAUDE.md hard rule.
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
  it('is registered as a simple-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.sharedLibrary
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in both Simple and Pro mode (the admin role is the real gate)', () => {
    expect(resolveFlags(false, {}, false, 'simple').sharedLibrary).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').sharedLibrary).toBe(true)
  })
})
