import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * `ambientcgLibrary` gates the ambientCG CC0 material library served from our
 * own R2 mirror. It is **pro** tier: a 1000-plus scan grid is pack-browser
 * territory, while Simple keeps the curated one-tap finish strip. It is NOT
 * devOnly — the whole point of mirroring into R2 is that the assets are CC0
 * and same-origin, so unlike the live ambientCG provider (no CORS headers,
 * dev-proxy only) this ships in production. Tested in BOTH modes per the
 * CLAUDE.md hard rule.
 */
describe('ambientcgLibrary feature flag', () => {
  it('is registered as a pro-tier feature, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.ambientcgLibrary
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').ambientcgLibrary).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').ambientcgLibrary).toBe(true)
  })
})
