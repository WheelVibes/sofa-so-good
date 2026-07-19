import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * MEP-EDITOR (G1 — first-class MEP layer, PR2): gates the persisted
 * electrical/plumbing point editor (tool/layer/inspector/Suggest, landing in
 * later PRs). It's an analytical/professional contractor-handover authoring
 * surface, not part of the minimal core furnish loop, so it's pro-tier —
 * forced off in Simple mode, present in Pro.
 */
describe('mepEditor feature flag', () => {
  it('is registered as a pro-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.mepEditor
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (forced off — pro tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').mepEditor).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').mepEditor).toBe(true)
  })
})
