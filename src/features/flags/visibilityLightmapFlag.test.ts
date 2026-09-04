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
  it('is registered, simple-tier and OFF by default', () => {
    const def = FEATURE_FLAGS.visibilityLightmap
    expect(def.tier).toBe('simple')
    // Shipped ON in `v0.31.7.169` and REVERTED in `v0.31.7.174`: a floor-pitched pose measured
    // the wood floor collapsing 126.7 -> 24.4 counts with the warm cast lost (R−B +26.9 -> −4.5).
    // `.169`'s wall/ceiling evidence stands; the survey behind it never included a floor.
    expect(def.default).toBe(false)
    // NOT devOnly -- the maps are CC0-irrelevant generated assets with no licensing or sidecar
    // dependency, so there is nothing to keep out of production.
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in BOTH modes while its default is false', () => {
    expect(resolveFlags(false, {}, false, 'simple').visibilityLightmap).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').visibilityLightmap).toBe(false)
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
    // Overrides need dev or admin. Back to the ON direction now that the default is false again:
    // the assertion must not be satisfiable by the default alone, or the permission test quietly
    // stops testing permissions.
    const on = { visibilityLightmap: true }
    expect(resolveFlags(false, on, false, 'simple').visibilityLightmap).toBe(false)
    expect(resolveFlags(false, on, true, 'simple').visibilityLightmap).toBe(true)
  })
})
