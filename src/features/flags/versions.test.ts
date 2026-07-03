import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * `versions` (save/restore/compare snapshots) is an analytical/professional
 * surface — the CLAUDE.md hard rule explicitly names "versions" among the
 * pro-tier examples (measure/checks/drawings/scores/AI/versions/authoring
 * tools). Tested in BOTH modes per the CLAUDE.md hard rule: hidden in
 * Simple, present in Pro.
 */
describe('versions feature flag', () => {
  it('is registered as a pro-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.versions
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').versions).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').versions).toBe(true)
  })
})
