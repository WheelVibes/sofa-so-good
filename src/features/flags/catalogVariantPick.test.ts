import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * CATALOG-VARIANT (2026-07-03 core-loop parity audit): a compact quick-look
 * swatch popover on the catalog card lets a shopper pick a colour/finish/
 * variant BEFORE placing, matching IKEA Kreativ / Coohom / Roomstyler's basic
 * browse behaviour. It's a core furnish-loop affordance (not an analytical/
 * professional surface), so it's simple-tier and present in BOTH Simple and
 * Pro — tested in both modes per the CLAUDE.md hard rule.
 */
describe('catalogVariantPick feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.catalogVariantPick
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').catalogVariantPick).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').catalogVariantPick).toBe(true)
  })
})
