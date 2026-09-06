// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * ORBIT-CLEAN-CUT ships two flags with OPPOSITE defaults, and both are `tier: 'simple'` — they
 * change the default orbit view, which is the mode the move-in default lives in, so a `pro` tier
 * would silence them exactly where they matter. CLAUDE.md requires both modes to be tested.
 */
describe('orbitCleanCut flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.orbitCleanCut
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code (one box per wall, orbit only) — no sidecar, nothing to keep out of production.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').orbitCleanCut).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').orbitCleanCut).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged session', () => {
    const off = { orbitCleanCut: false }
    expect(resolveFlags(true, off, false, 'simple').orbitCleanCut).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').orbitCleanCut).toBe(false)
    // …and not by an ordinary one.
    expect(resolveFlags(false, off, false, 'simple').orbitCleanCut).toBe(true)
  })
})

describe('chromaticAberration flag', () => {
  it('is registered, simple-tier and OFF by default', () => {
    const def = FEATURE_FLAGS.chromaticAberration
    // The whole point of the flag: on architecture the sub-pixel RGB split reads as coloured
    // fringing on wall edges, not as a lens cue, so it no longer rides `cinematic` alone.
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(false)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').chromaticAberration).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').chromaticAberration).toBe(false)
  })

  it('can be turned back ON in BOTH modes by a privileged session', () => {
    // A simple-tier flag is not stripped by Simple mode — that is what makes the A/B arm of the
    // verify scenario (`?ff=chromaticAberration:on`) reachable at all.
    const on = { chromaticAberration: true }
    expect(resolveFlags(true, on, false, 'simple').chromaticAberration).toBe(true)
    expect(resolveFlags(true, on, false, 'pro').chromaticAberration).toBe(true)
    expect(resolveFlags(false, on, false, 'pro').chromaticAberration).toBe(false)
  })
})
