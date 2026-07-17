import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for "Suggest views" (SAVED-VIEWS-SUGGEST): auto-computes a
 * starter set of saved camera views (a corner three-quarter angle per major
 * furnished room + one whole-flat overview) so the saved-views-consuming
 * presentation family has content without hand-authoring every bookmark.
 * Feeds the pro presentation family (Present…/Cinematic tour/Record/Render
 * all views), matching `presentation`/`batchRender` → pro tier, hidden in
 * Simple (the default). Tested in BOTH modes per the CLAUDE.md rule.
 */
describe('suggestedViews feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.suggestedViews
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').suggestedViews).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').suggestedViews).toBe(false)
  })
})
