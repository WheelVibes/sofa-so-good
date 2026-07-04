import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CATALOG-ROOMAWARE (2026-07-03 core-loop parity audit): the catalog lands on
 * the category relevant to the room being edited (bedroom→beds, kitchen→
 * appliances, ...) instead of always the same default. It's a passive
 * default-landing tweak in the core furnish loop (not an analytical/
 * professional surface), so it's simple-tier and present in BOTH Simple and
 * Pro mode.
 */
describe('catalogRoomAware feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.catalogRoomAware
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogRoomAware).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogRoomAware).toBe(true)
  })
})
