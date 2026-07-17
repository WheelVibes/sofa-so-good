import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Pet program (Stage P6): two flags.
 *  - `petProfile` (simple) gates the "Do you have pets?" per-design setting + the
 *    catalog "Essentials" surfacing — part of the core furnish loop, on in BOTH
 *    Simple and Pro.
 *  - `petCompliance` (pro) gates the compliance checklist panel + ⌘K command +
 *    report section — an analytical review tool, hidden in Simple, on in Pro.
 */
describe('petProfile feature flag (simple)', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.petProfile
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })
  it('is ON in Simple mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').petProfile).toBe(true)
  })
  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').petProfile).toBe(true)
  })
})

describe('petCompliance feature flag (pro)', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.petCompliance
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })
  it('is HIDDEN (forced off) in Simple mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').petCompliance).toBe(false)
  })
  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').petCompliance).toBe(true)
  })
})
