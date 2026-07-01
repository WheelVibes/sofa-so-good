import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the configurable price-rule library (PARITY-PRICE-RULES). A
 * pro-tier quoting tool: present in Pro, hidden in Simple (the default), so a
 * casual user just gets the built-in SG rate table with no extra UI. Tested in
 * BOTH modes per the CLAUDE.md hard rule.
 */
describe('priceRules feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.priceRules
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').priceRules).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').priceRules).toBe(false)
  })
})
