import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * PARAMETRIC-ROOF (TODO — UX research round 3, Homestyler v6 / Live Home 3D
 * precedent): gates the parametric roof (3D roof + editor section). A structural
 * authoring tool for whole-home shells → pro-tier, forced off in Simple.
 */
describe('parametricRoof feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.parametricRoof
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').parametricRoof).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').parametricRoof).toBe(true)
  })
})
