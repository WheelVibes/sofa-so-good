import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CATALOG-COMPARE (UX-research round 2 pick #3): a "compare 2-3 catalog items
 * side-by-side" tray. It's a core furnish-loop decision aid (which same-
 * category piece actually fits this HDB room), not an analytical/professional
 * surface, so it's simple-tier and present in BOTH Simple and Pro.
 */
describe('catalogCompare feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.catalogCompare
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogCompare).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogCompare).toBe(true)
  })
})
