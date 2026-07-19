import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * SWITCH-CIRCUITS (BSJ-3): gates the lighting & switching schematic — linking a
 * `switch` point to the lights it controls, the plan leader-line overlay, the
 * electrical-sheet circuit tags + legend, the DXF tag suffix, and the "Suggest
 * circuits" action. Analytical contractor-handover content, not part of the
 * minimal core furnish loop → pro-tier: forced off in Simple, present in Pro.
 */
describe('switchCircuits feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.switchCircuits
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').switchCircuits).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').switchCircuits).toBe(true)
  })
})
