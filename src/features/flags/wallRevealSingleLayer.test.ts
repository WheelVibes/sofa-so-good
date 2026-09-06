// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * WALL-REVEAL-SINGLE-LAYER changes the DEFAULT orbit view (and the room editor), which is where
 * the move-in default lives — so it is `tier: 'simple'` and ON by default, and CLAUDE.md requires
 * both UI modes to be tested. The off arm has to stay reachable in Simple mode for the A/B
 * verify scenario (`?ff=wallRevealSingleLayer:off`).
 */
describe('wallRevealSingleLayer flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.wallRevealSingleLayer
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code (one integer per fading wall per frame) — no sidecar, prod-safe.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').wallRevealSingleLayer).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').wallRevealSingleLayer).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged session', () => {
    const off = { wallRevealSingleLayer: false }
    expect(resolveFlags(true, off, false, 'simple').wallRevealSingleLayer).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').wallRevealSingleLayer).toBe(false)
    // …and not by an ordinary one.
    expect(resolveFlags(false, off, false, 'simple').wallRevealSingleLayer).toBe(true)
  })
})
