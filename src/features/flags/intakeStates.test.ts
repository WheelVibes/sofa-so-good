import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * BSJ-4 — the Smart Start "Starting state" group (bare BTO / BTO+OCS / resale
 * as-is / strip-out) is gated by the `ocsStarter` flag (id kept for back-compat,
 * label broadened to "Starting states"). It's a simple-tier core-loop feature,
 * so it must be ON in BOTH Simple and Pro modes.
 */
describe('ocsStarter flag (Starting states group)', () => {
  it('is a simple-tier feature', () => {
    expect(FEATURE_FLAGS.ocsStarter.tier).toBe('simple')
    expect(FEATURE_FLAGS.ocsStarter.default).toBe(true)
  })

  it('is enabled in BOTH Simple and Pro modes', () => {
    const simple = resolveFlags(false, {}, false, 'simple')
    const pro = resolveFlags(false, {}, false, 'pro')
    expect(simple.ocsStarter).toBe(true)
    expect(pro.ocsStarter).toBe(true)
  })
})
