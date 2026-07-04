import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for Alt/Option-drag duplicate (FEAT-B): starting a drag on an
 * already-selected item while holding Alt/Option clones it and drags the
 * copy. A power-user shortcut on top of the existing Duplicate button/⌘D →
 * pro tier: present in Pro, hidden in Simple (the default). Tested in BOTH
 * modes per the CLAUDE.md hard rule.
 */
describe('altDragDuplicate feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.altDragDuplicate
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').altDragDuplicate).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').altDragDuplicate).toBe(false)
  })
})
