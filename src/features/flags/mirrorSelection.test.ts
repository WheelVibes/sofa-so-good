import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the selection axis-mirror control (FEAT-2): mirror the
 * current selection across a chosen room axis (X or Z), reflecting position +
 * heading and flipping geometry so an asymmetric group reads as its true
 * mirror image. An arrange-tool refinement, not core-loop → pro tier, hidden
 * in Simple (the default). Tested in BOTH modes per the CLAUDE.md hard rule.
 */
describe('mirrorSelection feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.mirrorSelection
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').mirrorSelection).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').mirrorSelection).toBe(false)
  })
})
