import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'
import { VIEW_ONLY_BLOCKED_FLAGS } from './viewOnly'

/**
 * AO-GLAZING-OPAQUE (R7-AE). A rendering cost fix, not a surface: window glass stops being
 * re-lit twice a frame for the AO transparency pass. Simple-tier so the default experience gets it, and
 * NOT view-only-blocked — a showroom visitor must get the same render. Tested in both modes per
 * CLAUDE.md.
 */
describe('aoGlazingOpaque feature flag', () => {
  it('is registered as a simple-tier feature, default on, not dev-gated', () => {
    const def = FEATURE_FLAGS.aoGlazingOpaque
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode and in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').aoGlazingOpaque).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').aoGlazingOpaque).toBe(true)
  })

  it('can be turned off (the control arm), in both modes', () => {
    const off = { aoGlazingOpaque: false }
    expect(resolveFlags(true, off, false, 'simple').aoGlazingOpaque).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').aoGlazingOpaque).toBe(false)
  })

  it('stays on for a showroom visitor (rendering, not authoring)', () => {
    expect(VIEW_ONLY_BLOCKED_FLAGS).not.toContain('aoGlazingOpaque')
  })
})
