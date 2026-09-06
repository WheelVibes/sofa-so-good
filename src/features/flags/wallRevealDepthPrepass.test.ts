// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * WALL-REVEAL-DEPTH-PREPASS changes the DEFAULT orbit view and the room editor, so it is
 * `tier: 'simple'` and ON by default, and CLAUDE.md requires both UI modes to be tested. The
 * off arm has to stay reachable in Simple mode for the A/B verify scenario
 * (`?ff=wallRevealDepthPrepass:off`).
 */
describe('wallRevealDepthPrepass flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.wallRevealDepthPrepass
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code (one extra depth-only draw per FADING wall) — no sidecar, prod-safe.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').wallRevealDepthPrepass).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').wallRevealDepthPrepass).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged session', () => {
    const off = { wallRevealDepthPrepass: false }
    expect(resolveFlags(true, off, false, 'simple').wallRevealDepthPrepass).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').wallRevealDepthPrepass).toBe(false)
    // …and not by an ordinary one.
    expect(resolveFlags(false, off, false, 'simple').wallRevealDepthPrepass).toBe(true)
  })
})
