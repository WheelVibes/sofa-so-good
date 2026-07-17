import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'
import type { FeatureFlag } from './types'

/**
 * Flag gating for Asset Studio Stage 3d (sets & modular customization). Both
 * surfaces are pro-tier power authoring tools inside the (already pro-only) GLB
 * designer — present in Pro, forced OFF in Simple. Prod-safe pure code (the
 * configurable-product export bakes GLB options through the existing configurator
 * channel; sets split re-uses the GLB export path). Tested in BOTH modes per the
 * CLAUDE.md hard rule.
 */
describe.each<FeatureFlag>(['assetConfigurableExport', 'assetSets'])('Stage 3d flag %s', (flag) => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS[flag]
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro')[flag]).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple')[flag]).toBe(false)
  })
})
