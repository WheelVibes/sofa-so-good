import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * ceilingClearance (UX research round 4, R4-2): the false-ceiling finished-
 * headroom check surfaced on the RCP sheet. An analytical check like the other
 * drawing-set/analysis features — pro-tier, forced off in Simple.
 */
describe('ceilingClearance feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.ceilingClearance
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').ceilingClearance).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').ceilingClearance).toBe(true)
  })
})
