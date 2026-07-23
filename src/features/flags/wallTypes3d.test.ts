import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

describe('wallTypes3d feature flag (wall-types 3D overlay)', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.wallTypes3d
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').wallTypes3d).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').wallTypes3d).toBe(false)
  })
})
