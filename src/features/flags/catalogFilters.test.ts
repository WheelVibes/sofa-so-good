import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * `catalogFilters` — the availability / source / favourites filter control over
 * the furniture grid. Pure client-side filtering → prod-safe; a browse
 * convenience in the core furnish loop → simple tier, present in BOTH modes.
 */
describe('catalogFilters feature flag', () => {
  it('is registered as a simple-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.catalogFilters
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('resolves ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogFilters).toBe(true)
  })

  it('resolves ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogFilters).toBe(true)
  })
})
