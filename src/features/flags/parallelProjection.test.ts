import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * R3-FEAT-3: flag gating for the parallel-projection / orthographic "dollhouse"
 * view toggle — swaps the whole-flat orbit camera between perspective and
 * orthographic projection (the SketchUp / Sweet Home 3D "Parallel projection"
 * control). Pure client-side camera math (prod-safe, default on), but an
 * advanced viewing lever beyond the core loop → pro tier, hidden in Simple (the
 * default experience). Tested in BOTH modes per the CLAUDE.md hard rule.
 */
describe('parallelProjection feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.parallelProjection
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').parallelProjection).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').parallelProjection).toBe(false)
  })
})
