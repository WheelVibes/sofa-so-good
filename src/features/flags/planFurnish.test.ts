import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for click-to-place furniture in the 2D plan editor
 * (PLAN-FURNISH Phase 1). A pro-tier plan-authoring surface: present in Pro,
 * hidden in Simple (the default), where furnishing stays the 3D catalog-drag
 * loop. Tested in BOTH modes per the CLAUDE.md hard rule.
 */
describe('planFurnish feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.planFurnish
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').planFurnish).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').planFurnish).toBe(false)
  })
})
