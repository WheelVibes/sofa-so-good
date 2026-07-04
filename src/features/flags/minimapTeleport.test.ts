import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the walk-mode minimap tap-to-teleport (MINIMAP-JUMP). A
 * sibling flag to `walkWindowFixtures`/`walkScreens`/`walkLights` (same
 * granular-per-affordance precedent, not a widened umbrella flag) — a core
 * walk-mode navigation aid, so simple tier, present in BOTH Simple and Pro.
 */
describe('minimapTeleport feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.minimapTeleport
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').minimapTeleport).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').minimapTeleport).toBe(true)
  })
})
