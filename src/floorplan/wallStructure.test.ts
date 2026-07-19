import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/flags/resolve'

describe('wallStructure feature flag (TODO G7 — pro tier)', () => {
  it('is on in Pro mode and forced off in Simple mode', () => {
    expect(resolveFlags(true, {}, false, 'pro').wallStructure).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').wallStructure).toBe(false)
  })
})
