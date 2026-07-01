import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the keyboard-shortcuts help overlay ("?"). A power-user
 * discoverability aid → pro tier: present in Pro, hidden in Simple (the default),
 * where casual users navigate by mouse/menus. Tested in BOTH modes per CLAUDE.md.
 */
describe('shortcutsHelp feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.shortcutsHelp
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').shortcutsHelp).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').shortcutsHelp).toBe(false)
  })
})
