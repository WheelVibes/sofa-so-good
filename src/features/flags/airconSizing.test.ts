import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the per-room aircon BTU cooling-load advisory (R4-1). An
 * analytical check → pro tier: present in Pro, hidden in Simple (the default),
 * where casual users stay on the minimal furnish/finish/view loop. Tested in
 * BOTH modes per CLAUDE.md.
 */
describe('airconSizing feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.airconSizing
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').airconSizing).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').airconSizing).toBe(false)
  })
})
