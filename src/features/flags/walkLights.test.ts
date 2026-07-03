import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for walk-mode light on/off interact (click/tap/E,
 * WALK-LIGHT-INTERACT). A sibling flag to `walkWindowFixtures`/`walkScreens`
 * (not a widened umbrella flag — see registry.ts comment) — same core
 * "explore the space" walk-mode delight, so simple tier, present in BOTH
 * Simple and Pro.
 */
describe('walkLights feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.walkLights
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').walkLights).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').walkLights).toBe(true)
  })
})
