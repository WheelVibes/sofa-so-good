import { describe, expect, it } from 'vitest'
import { resolveFlags } from './featureFlags'

/**
 * `planReset` gates the plan-level "New apartment… / Reset apartment…" entries
 * that now sit in the File menu and ⌘K (they used to be reachable only from
 * inside the 2D editor). Starting over is core to the design loop, not an
 * advanced tool, so it is `simple` tier — present in BOTH modes.
 */
describe('planReset flag', () => {
  // resolveFlags(isDev, overrides, isAdmin, uiMode)
  it('is on in Simple mode (the app default)', () => {
    expect(resolveFlags(false, {}, false, 'simple').planReset).toBe(true)
  })

  it('is on in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').planReset).toBe(true)
  })

  it('can still be turned off by a privileged override, in both modes', () => {
    // Overrides only apply to dev/admin (see `flags/resolve.ts`).
    expect(resolveFlags(false, { planReset: false }, true, 'simple').planReset).toBe(false)
    expect(resolveFlags(false, { planReset: false }, true, 'pro').planReset).toBe(false)
  })
})
