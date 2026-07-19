import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * RCP-SHEET (TODO H4 — contractor handover, canonical drawing #4): gates the
 * reflected ceiling plan sheet on the drawing set. Analytical drawing-set
 * content, like `settingOutDims`/`carpentrySheets` — pro-tier, forced off in
 * Simple.
 */
describe('rcpSheet feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.rcpSheet
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').rcpSheet).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').rcpSheet).toBe(true)
  })
})
