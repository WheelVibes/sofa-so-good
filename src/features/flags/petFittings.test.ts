import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Pet program (Stage P1): the `petFittings` flag gates the `pets` catalog
 * category (pet beds, safety window mesh screens, doorway pet gates, pet-door
 * inserts, playpens). Placing pet furniture is part of the core furnish loop, so
 * it's simple-tier and present in BOTH Simple and Pro mode.
 */
describe('petFittings feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.petFittings
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').petFittings).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').petFittings).toBe(true)
  })
})
