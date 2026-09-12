import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * WINDOW-BLOWOUT. A **simple**-tier look fix — it changes the default experience, so it must be on
 * in both modes. Tested in BOTH per CLAUDE.md.
 *
 * A camera exposed for a room clips the view outside, and the app had none of that: the aperture
 * topped out at 208 counts with **0.0 %** near-white pixels, against ~33 % in both a real apartment
 * photograph and a Cycles render of our own scene at the same pose.
 */
describe('windowBlowout feature flag', () => {
  it('is registered as a simple-tier feature, default on', () => {
    const def = FEATURE_FLAGS.windowBlowout
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code over already-shipped procedural scenery: nothing licensed to dev-gate.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode, the default experience', () => {
    expect(resolveFlags(false, {}, false, 'simple').windowBlowout).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').windowBlowout).toBe(true)
  })

  it('can be turned off, restoring the old exterior boost', () => {
    // `isDev` true: `resolveFlags` only honours an override for a privileged caller, so passing
    // false here would assert nothing.
    expect(resolveFlags(true, { windowBlowout: false }, false, 'simple').windowBlowout).toBe(false)
  })
})
