// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CLAUDE.md requires anything whose visibility depends on the Simple/Pro mode to be tested in
 * **both** modes. `visibilityLightmap` is `tier: 'simple'`, so it must survive Simple mode — a
 * `pro` tier would have silenced it in the mode the move-in default lives in, which is exactly
 * where the fidelity gain matters most.
 */
describe('visibilityLightmap flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.visibilityLightmap
    expect(def.tier).toBe('simple')
    // ON again in `v0.31.7.176`, after `.175` found and fixed the shared-material cause of
    // `.174`'s black floor and a 44-frame / 11-room sweep found no unexplained darkening.
    expect(def.default).toBe(true)
    // NOT devOnly -- the maps are CC0-irrelevant generated assets with no licensing or sidecar
    // dependency, so there is nothing to keep out of production.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes now that its default is true', () => {
    // The tier assertion above is what makes this pass in Simple: a `pro` tier would be stripped
    // there, silencing the flag in the mode the move-in default lives in.
    expect(resolveFlags(false, {}, false, 'simple').visibilityLightmap).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').visibilityLightmap).toBe(true)
  })

  it('can be enabled in BOTH modes — a simple-tier flag is not stripped by Simple', () => {
    // The property that matters when the default flips: Simple mode must not force it off.
    // A `pro` tier would be zeroed here regardless of the override, which is why the tier
    // assertion above is not cosmetic.
    const on = { visibilityLightmap: true }
    expect(resolveFlags(true, on, false, 'simple').visibilityLightmap).toBe(true)
    expect(resolveFlags(true, on, false, 'pro').visibilityLightmap).toBe(true)
  })

  it('ignores an override for an unprivileged user, like every other flag', () => {
    // Overrides need dev or admin. Tested in the OFF direction while the default is true: with an
    // `on` override the assertion would pass on the default alone and prove nothing, which is how
    // a permission test quietly stops testing permissions.
    const off = { visibilityLightmap: false }
    expect(resolveFlags(false, off, false, 'simple').visibilityLightmap).toBe(true)
    expect(resolveFlags(false, off, true, 'simple').visibilityLightmap).toBe(false)
  })
})
