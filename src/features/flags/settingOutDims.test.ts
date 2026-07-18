import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * SETTING-OUT-DIMS (TODO G3 — contractor handover): gates the datum-referenced
 * setting-out dimension row on the dimensioned-plan sheet + the tile
 * setting-out crosses on the floor-plan sheet. An analytical drawing-set
 * feature, like the sheet it extends — pro-tier, forced off in Simple.
 */
describe('settingOutDims feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.settingOutDims
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').settingOutDims).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').settingOutDims).toBe(true)
  })
})
