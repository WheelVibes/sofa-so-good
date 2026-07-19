import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the whole-renovation budget allocator (BSJ-1). Core decision
 * support for the blank-slate owner → simple tier, default on, so it shows in
 * BOTH Simple and Pro mode. Tested in BOTH modes per CLAUDE.md.
 */
describe('renoBudget feature flag', () => {
  it('is registered as a simple-tier feature, default on', () => {
    const def = FEATURE_FLAGS.renoBudget
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').renoBudget).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').renoBudget).toBe(true)
  })
})
