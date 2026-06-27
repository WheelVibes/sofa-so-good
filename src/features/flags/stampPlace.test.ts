import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for sticky stamp placement (PARITY-STAMP-PLACE). A pro-tier
 * productivity aid: present in Pro, hidden in Simple (the default), so a casual
 * user keeps the classic single-add behaviour with no extra UI. Tested in BOTH
 * modes per the CLAUDE.md hard rule.
 */
describe('stampPlace feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.stampPlace
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').stampPlace).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').stampPlace).toBe(false)
  })
})
