import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Real-photo paint visualizer (UX-research round 3): a casual "try this colour
 * on my real wall" preview in the core finish loop — pure client-side canvas
 * maths, no external assets. Simple-tier, present in BOTH Simple and Pro.
 */
describe('paintVisualizer feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.paintVisualizer
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').paintVisualizer).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').paintVisualizer).toBe(true)
  })
})
