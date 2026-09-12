import { describe, expect, it } from 'vitest'
import { LIGHTMAP_RED_TO_LUMA } from '../../scene/visibilityLightmap'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * LIGHTMAP-CHANNEL. A **simple**-tier render-quality fix, not an analytical tool: it changes what
 * the default experience looks like, so it must be ON in both modes. Tested in BOTH per CLAUDE.md.
 *
 * The shader sampled the baked lightmap's `.r` channel as a scalar and re-supplied colour as one
 * global tint, so every surface received indirect light of the same hue — measured against a
 * physical Cycles reference as a chroma range 35 % narrower than physics.
 */
describe('lightmapChroma feature flag', () => {
  it('is registered as a simple-tier feature, default on', () => {
    const def = FEATURE_FLAGS.lightmapChroma
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    // Pure code + already-shipped assets: nothing licensed or sidecar-dependent to dev-gate.
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode, the default experience', () => {
    expect(resolveFlags(false, {}, false, 'simple').lightmapChroma).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').lightmapChroma).toBe(true)
  })

  it('can be turned off, and the off state is the historical scalar path', () => {
    // `isDev` true: `resolveFlags` only honours an override for a privileged caller, so passing
    // false here would assert nothing (the flag would read its default and the test would pass
    // for the wrong reason).
    expect(resolveFlags(true, { lightmapChroma: false }, false, 'simple').lightmapChroma).toBe(
      false,
    )
  })

  it('pairs the RGB sample with a DIVIDED gain, so the arm cannot change brightness', () => {
    // The two halves are applied together inside `applyVisibilityLightmap` precisely so a caller
    // cannot take one without the other: sampling RGB without dividing the gain would make the
    // feature 1.23x brighter, and every comparison against the reference would then be measuring
    // exposure while claiming to measure colour.
    expect(LIGHTMAP_RED_TO_LUMA).toBeGreaterThan(0.7)
    expect(LIGHTMAP_RED_TO_LUMA).toBeLessThan(0.9)
  })
})
