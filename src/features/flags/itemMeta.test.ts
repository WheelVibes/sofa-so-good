import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Per-instance notes & link (ITEM-META, 2026-07-18): a custom URL, price
 * override, brand/model/supplier, description, and remarks on every placed
 * item — documentation/handover-oriented (feeds the FF&E schedule / spec
 * book), not part of the core furnish/finish/view/share loop → pro tier.
 * Present in Pro, hidden in Simple (the default). Tested in BOTH modes per
 * the CLAUDE.md hard rule.
 */
describe('itemMeta feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.itemMeta
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').itemMeta).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').itemMeta).toBe(false)
  })
})
