import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

describe('planTraceBackdrop flag', () => {
  it('is registered as a pro-tier, prod-default-on flag', () => {
    expect(FEATURE_FLAGS.planTraceBackdrop).toMatchObject({ default: true, tier: 'pro' })
  })

  it('is forced off in Simple mode and on in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').planTraceBackdrop).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').planTraceBackdrop).toBe(true)
  })
})
