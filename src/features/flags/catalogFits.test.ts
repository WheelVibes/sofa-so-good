import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CATALOG-FITS (2026-07-03 core-loop parity audit): a passive "fits this room"
 * size cue on catalog cards. It's a read-only help cue in the core furnish
 * loop (not an analytical/professional surface), so it's simple-tier and
 * present in BOTH Simple and Pro — see `catalogFitsFilter` for the pro-tier
 * "Fits only" browse filter built on top of it.
 */
describe('catalogFits feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.catalogFits
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogFits).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogFits).toBe(true)
  })
})

/**
 * The "Fits only" browse-filter toggle is an analytical refinement over the
 * passive `catalogFits` cue (hiding items outright, not just flagging them) —
 * pro tier, hidden in Simple mode per the CLAUDE.md hard rule.
 */
describe('catalogFitsFilter feature flag', () => {
  it('is registered as a pro-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.catalogFitsFilter
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogFitsFilter).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').catalogFitsFilter).toBe(true)
  })
})
