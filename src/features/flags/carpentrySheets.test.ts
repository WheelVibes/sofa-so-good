import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CARPENTRY-SHEETS (TODO G8 — contractor handover): gates the per-piece
 * carpentry elevation + section sheets on the drawing set. Analytical
 * drawing-set content, like `settingOutDims` — pro-tier, forced off in Simple.
 */
describe('carpentrySheets feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.carpentrySheets
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').carpentrySheets).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').carpentrySheets).toBe(true)
  })
})
