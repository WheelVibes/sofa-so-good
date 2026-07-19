import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * UX-7 finish eyedropper — sample a surface's finish in the 3D scene, then
 * paint it onto other walls/floors. Pure prod-safe code that's part of the
 * core finish loop, so it's simple-tier and present in BOTH Simple and Pro.
 */
describe('finishEyedropper feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.finishEyedropper
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').finishEyedropper).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').finishEyedropper).toBe(true)
  })
})
