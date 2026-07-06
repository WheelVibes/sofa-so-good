import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../../features/flags/registry'
import { resolveFlags } from '../../features/flags/resolve'

describe('profiler feature flag', () => {
  it('is registered as a dev-only pro-tier flag, off by default', () => {
    const def = FEATURE_FLAGS.profiler
    expect(def).toBeDefined()
    expect(def.devOnly).toBe(true)
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(false)
  })

  it('is OFF in a production build regardless of mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').profiler).toBe(false)
    expect(resolveFlags(false, {}, false, 'simple').profiler).toBe(false)
  })

  it('is OFF in Simple mode even in dev (pro-tier)', () => {
    expect(resolveFlags(true, {}, false, 'simple').profiler).toBe(false)
  })

  it('is available in dev + Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'pro').profiler).toBe(true)
  })
})
