// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CLAUDE.md requires anything whose visibility/behaviour depends on the Simple/Pro
 * mode to be tested in **both** modes. `softwareRasterFallback` has no UI of its
 * own — it changes what the renderer resolves to — but it is `tier: 'simple'`
 * precisely so it is NOT stripped in Simple mode: a `pro` tier would silence the
 * fallback for exactly the casual, no-GPU user it exists to protect, and it would
 * do so invisibly (the scene would just be slow, with nothing to point at).
 *
 * `default: false` as of `v0.33.2.7` — the certified fence measurement
 * (`docs/open-graphics-decisions.md` item (af)) found no reproducible speed win and
 * a flatter frame, so the floor is now opt-in pending that product call. The flag
 * and the floor code stay; only the default moved.
 */
describe('softwareRasterFallback flag', () => {
  it('is registered, simple-tier and OFF by default', () => {
    const def = FEATURE_FLAGS.softwareRasterFallback
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(false)
    // NOT devOnly — pure code with no licensed asset or sidecar dependency, so
    // there is nothing to keep out of production.
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in BOTH modes by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').softwareRasterFallback).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').softwareRasterFallback).toBe(false)
  })

  it('can be turned ON in BOTH modes by a privileged user', () => {
    // The direction that matters while the default is false: an `off` override
    // would pass on the default alone and prove nothing.
    const on = { softwareRasterFallback: true }
    expect(resolveFlags(true, on, false, 'simple').softwareRasterFallback).toBe(true)
    expect(resolveFlags(true, on, false, 'pro').softwareRasterFallback).toBe(true)
  })

  it('ignores an override for an unprivileged user, like every other flag', () => {
    const on = { softwareRasterFallback: true }
    expect(resolveFlags(false, on, false, 'simple').softwareRasterFallback).toBe(false)
    expect(resolveFlags(false, on, true, 'simple').softwareRasterFallback).toBe(true)
  })
})
