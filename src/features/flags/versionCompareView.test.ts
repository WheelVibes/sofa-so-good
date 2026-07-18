import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the live 3D version split-view compare (UX-R11): a
 * "Compare in 3D" action on each saved version row, sibling of `versions`
 * itself — same pro-tier surface, hidden in Simple (the default).
 */
describe('versionCompareView feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.versionCompareView
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').versionCompareView).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').versionCompareView).toBe(false)
  })
})
