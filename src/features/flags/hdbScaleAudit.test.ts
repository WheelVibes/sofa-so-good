import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * HDB-SCALE-AUDIT flag gating. Pure dimension corrections on the shell + fittings, cited to
 * SCDF TRHS 2023 and the BCA Code on Accessibility — no assets, no lighting, nothing
 * analytical, so simple tier and on in BOTH modes. The corrected dimensions themselves are
 * tested in `src/apartment/hdbScaleAudit.test.ts`.
 */
describe('hdbScaleAudit feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.hdbScaleAudit
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('cites every corrected dimension in its description', () => {
    const d = FEATURE_FLAGS.hdbScaleAudit.description
    expect(d).toMatch(/700/)
    expect(d).toMatch(/1900/)
    expect(d).toMatch(/1000 mm/)
    expect(d).toMatch(/250 mm/)
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').hdbScaleAudit).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').hdbScaleAudit).toBe(true)
  })

  it('is reversible by a privileged override in both modes (the flag-off audit arm)', () => {
    // `resolveFlags` honours an override only for a dev/admin session — that is the path
    // `?ff=hdbScaleAudit:off` uses, and it is how `scripts/dev-probes/scale-audit.mjs`
    // re-measures the pre-audit dimensions.
    expect(resolveFlags(true, { hdbScaleAudit: false }, false, 'simple').hdbScaleAudit).toBe(false)
    expect(resolveFlags(true, { hdbScaleAudit: false }, false, 'pro').hdbScaleAudit).toBe(false)
    // ...and NOT for an unprivileged one, so a shared link cannot ship the old dimensions.
    expect(resolveFlags(false, { hdbScaleAudit: false }, false, 'simple').hdbScaleAudit).toBe(true)
  })
})
