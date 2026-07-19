import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Native share sheet for the hero card (UX round-3 #1): sharing the rendered
 * hero card through `navigator.share({ files })` on supporting devices. Pure
 * client-side Web Share API, no sidecar → prod-safe; extends the core "share"
 * stage of the loop → simple tier, present in BOTH Simple and Pro.
 */
describe('shareCardNative feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.shareCardNative
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').shareCardNative).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').shareCardNative).toBe(true)
  })
})
