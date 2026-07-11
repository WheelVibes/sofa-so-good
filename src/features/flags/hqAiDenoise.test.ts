import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the HQ render's OIDN AI denoise pass (PHOTO-DENOISE).
 * It enhances the finished `hqRender` still, so it matches its host feature's
 * tier exactly: simple, default on, prod-safe (Apache-2.0 OIDN weights are
 * self-hosted under public/denoiser-tzas/ — no licensed sidecar, so no devOnly).
 */
describe('hqAiDenoise feature flag', () => {
  it('is registered simple-tier, default on, no devOnly — matching hqRender', () => {
    const def = FEATURE_FLAGS.hqAiDenoise
    expect(def).toBeDefined()
    expect(def.tier).toBe(FEATURE_FLAGS.hqRender.tier)
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').hqAiDenoise).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').hqAiDenoise).toBe(true)
  })

  it('can be overridden off in a privileged (dev/QA) session — the edge-blur fallback path', () => {
    expect(resolveFlags(true, { hqAiDenoise: false }, false, 'pro').hqAiDenoise).toBe(false)
  })
})
