import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for walk-mode point-to-point measure (WALK-MEASURE). Mirrors
 * the orbit-mode `measure` tool's tier (`simple` — a core "will this fit
 * here?" sizing question for small HDB homes, not an analytical extra), so
 * it's present in BOTH Simple and Pro. Tested in both modes per CLAUDE.md.
 */
describe('walkMeasure feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.walkMeasure
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('mirrors the orbit-mode measure tool tier (both simple)', () => {
    expect(FEATURE_FLAGS.walkMeasure.tier).toBe(FEATURE_FLAGS.measure.tier)
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').walkMeasure).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').walkMeasure).toBe(true)
  })
})
