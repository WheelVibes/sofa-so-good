import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'
import { VIEW_ONLY_BLOCKED_FLAGS } from './viewOnly'

/**
 * ROOM-SCOPED-LIGHTS (R7-AE). A rendering fix, not a surface: the lights switch stops recompiling
 * and lamps stop lighting rooms through walls. Simple-tier so the default experience gets it, and
 * NOT view-only-blocked — a showroom visitor must get the same render. Tested in both modes per
 * CLAUDE.md.
 */
describe('roomScopedLights feature flag', () => {
  it('is registered as a simple-tier feature, default on, not dev-gated', () => {
    const def = FEATURE_FLAGS.roomScopedLights
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode and in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').roomScopedLights).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').roomScopedLights).toBe(true)
  })

  it('can be turned off (the control arm), in both modes', () => {
    const off = { roomScopedLights: false }
    expect(resolveFlags(true, off, false, 'simple').roomScopedLights).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').roomScopedLights).toBe(false)
  })

  it('stays on for a showroom visitor (rendering, not authoring)', () => {
    expect(VIEW_ONLY_BLOCKED_FLAGS).not.toContain('roomScopedLights')
  })
})
