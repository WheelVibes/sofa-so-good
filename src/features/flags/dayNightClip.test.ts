import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the day → night animated render clip (DAY-NIGHT-CLIP): while
 * recording the saved-views walkthrough video, sweep the time-of-day slider
 * across a chosen range so the exported clip transitions through lighting
 * conditions. A presentation flourish on the pro recording path → pro tier,
 * hidden in Simple (the default). Tested in BOTH modes per the CLAUDE.md rule.
 */
describe('dayNightClip feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.dayNightClip
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').dayNightClip).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').dayNightClip).toBe(false)
  })
})
