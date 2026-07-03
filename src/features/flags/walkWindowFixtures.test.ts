import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for walk-mode curtain/blind interact (click/tap/E to toggle,
 * WINDOW-FIXTURE-INTERACT). It's a core "explore the space" walk-mode delight
 * mirroring the ungated door-swing affordance, so it's simple tier — present
 * in BOTH Simple and Pro, per CLAUDE.md. Tested in both modes per CLAUDE.md.
 */
describe('walkWindowFixtures feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.walkWindowFixtures
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').walkWindowFixtures).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').walkWindowFixtures).toBe(true)
  })
})
