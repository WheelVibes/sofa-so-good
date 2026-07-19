import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * roomStarters (UX-research pick #5): tap-to-add "essentials" chips in the
 * empty-room hint, tailored to the room kind. Concrete onboarding help in the
 * core furnish loop for a first-time / Simple-tier user (the analytical
 * `suggestions` surface is Pro-only), so it's simple-tier and present in BOTH
 * Simple and Pro mode.
 */
describe('roomStarters feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.roomStarters
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').roomStarters).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').roomStarters).toBe(true)
  })
})
