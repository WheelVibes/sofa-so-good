import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CATALOG-RECENTS (UX-research pick): the recently-placed quick-add strip +
 * "Recent" pseudo-category tab. An automatic, item-level convenience in the
 * core furnish loop (the "thing I just used" complement to the deliberate
 * Favourites star), so it's simple-tier and present in BOTH Simple and Pro.
 */
describe('catalogRecents feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.catalogRecents
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogRecents).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogRecents).toBe(true)
  })
})
