import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * PLUMBING-FITTINGS flag gating. Pure procedural geometry (floor traps, taps, PVC stacks,
 * the storage heater) resolved from the plan's own MEP layer — prod-safe, and part of what a
 * wet room LOOKS like rather than an analytical tool, so simple tier and on in BOTH modes.
 */
describe('plumbingFittings feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.plumbingFittings
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').plumbingFittings).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').plumbingFittings).toBe(true)
  })
})
