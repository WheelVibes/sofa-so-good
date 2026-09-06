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
 */
describe('softwareRasterFallback flag', () => {
  it('is registered, simple-tier and ON by default', () => {
    const def = FEATURE_FLAGS.softwareRasterFallback
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // NOT devOnly — pure code with no licensed asset or sidecar dependency, so
    // there is nothing to keep out of production.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in BOTH modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').softwareRasterFallback).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').softwareRasterFallback).toBe(true)
  })

  it('can be turned OFF in BOTH modes by a privileged user', () => {
    // The direction that matters while the default is true: an `on` override would
    // pass on the default alone and prove nothing.
    const off = { softwareRasterFallback: false }
    expect(resolveFlags(true, off, false, 'simple').softwareRasterFallback).toBe(false)
    expect(resolveFlags(true, off, false, 'pro').softwareRasterFallback).toBe(false)
  })

  it('ignores an override for an unprivileged user, like every other flag', () => {
    const off = { softwareRasterFallback: false }
    expect(resolveFlags(false, off, false, 'simple').softwareRasterFallback).toBe(true)
    expect(resolveFlags(false, off, true, 'simple').softwareRasterFallback).toBe(false)
  })
})
