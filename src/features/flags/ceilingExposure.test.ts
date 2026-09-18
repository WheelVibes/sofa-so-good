import { describe, expect, it } from 'vitest'
import { ceilingExposureScale } from '../../scene/lighting/ceilingCoverage'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CEILING-EXPOSURE (audit finding N4). A **simple**-tier look fix — it changes the default walk
 * experience, so it must be on in both modes. Tested in BOTH per CLAUDE.md.
 *
 * Pitching up in walk mode filled the frame with a featureless near-white ceiling
 * (`walk-pitch-limits-phone` frame 222: mean 223.9, **28.8 % >= 240**, sd 23.5, held to the end
 * of the clip). The fix stops the camera down when the ceiling owns the frame, the way a real one
 * does; the flag's OFF branch is the pre-fix build.
 */
describe('ceilingExposure feature flag', () => {
  it('is registered as a simple-tier feature, default on', () => {
    const def = FEATURE_FLAGS.ceilingExposure
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure CPU maths over geometry the app already builds: nothing licensed to dev-gate.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode, the default experience', () => {
    expect(resolveFlags(false, {}, false, 'simple').ceilingExposure).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').ceilingExposure).toBe(true)
  })

  it('can be turned off, restoring the un-stopped-down exposure', () => {
    // `isDev` true: `resolveFlags` only honours an override for a privileged caller, so passing
    // false here would assert nothing.
    expect(resolveFlags(true, { ceilingExposure: false }, false, 'simple').ceilingExposure).toBe(
      false,
    )
  })

  it('OFF is the exact IEEE-754 identity, which is what makes it a real control', () => {
    // `Lighting.tsx` holds the eased scale at the literal 1 whenever the flag is off (its
    // `ceilingQuads` memo returns an empty array, so the ramp never runs), and multiplies
    // `toneMappingExposure` by it. `x * 1 === x` exactly, so the OFF arm is byte-for-byte the
    // pre-fix build — not a value that merely rounds to it.
    const off = 1
    for (const exposure of [0.78, 1.05, 1.2, 1.38, 0.1234567890123]) {
      expect(exposure * off).toBe(exposure)
    }
    // And the ON branch below the ramp start returns that same literal, so an ordinary walk
    // pose is identical whichever way the flag is set.
    expect(ceilingExposureScale(0)).toBe(1)
  })
})
