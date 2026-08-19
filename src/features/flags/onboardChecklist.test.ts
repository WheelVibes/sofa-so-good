import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * UIUX-28: the getting-started checklist is beginner aid in the default
 * experience — simple tier, default on, present in BOTH Simple and Pro.
 */
describe('onboardChecklist feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.onboardChecklist
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').onboardChecklist).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').onboardChecklist).toBe(true)
  })

  it('can be turned off by override', () => {
    expect(resolveFlags(true, { onboardChecklist: false }, false, 'simple').onboardChecklist).toBe(
      false,
    )
  })
})
