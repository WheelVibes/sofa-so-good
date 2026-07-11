import { describe, expect, it } from 'vitest'
import {
  AI_DENOISE_MAX_PIXELS,
  aiDenoiseEligible,
  denoiserBackendOrder,
  denoiserWeightsUrl,
} from './hqAiDenoiseMath'

/** Pure gates/format helpers for the HQ render AI denoise (PHOTO-DENOISE). */
describe('aiDenoiseEligible', () => {
  it('accepts the shipped resolutions up to 4K', () => {
    expect(aiDenoiseEligible(192, 108)).toBe(true) // dev-tiny
    expect(aiDenoiseEligible(1280, 720)).toBe(true)
    expect(aiDenoiseEligible(1920, 1080)).toBe(true)
    expect(aiDenoiseEligible(2560, 1440)).toBe(true)
    expect(aiDenoiseEligible(3840, 2160)).toBe(true) // exactly the cap
  })

  it('rejects 8K (falls back to the edge-blur)', () => {
    expect(aiDenoiseEligible(7680, 4320)).toBe(false)
    expect(7680 * 4320).toBeGreaterThan(AI_DENOISE_MAX_PIXELS)
  })

  it('rejects degenerate/non-finite sizes', () => {
    expect(aiDenoiseEligible(0, 1080)).toBe(false)
    expect(aiDenoiseEligible(1920, 8)).toBe(false)
    expect(aiDenoiseEligible(Number.NaN, 1080)).toBe(false)
    expect(aiDenoiseEligible(Number.POSITIVE_INFINITY, 1080)).toBe(false)
  })
})

describe('denoiserBackendOrder', () => {
  it('prefers WebGPU when the browser exposes it, then WebGL2, then CPU', () => {
    expect(denoiserBackendOrder(true)).toEqual(['webgpu', 'webgl', 'cpu'])
  })

  it('skips WebGPU when unavailable', () => {
    expect(denoiserBackendOrder(false)).toEqual(['webgl', 'cpu'])
  })
})

describe('denoiserWeightsUrl', () => {
  it('resolves the root base against the page origin, no trailing slash', () => {
    expect(denoiserWeightsUrl('/', 'http://localhost:5173/some/page')).toBe(
      'http://localhost:5173/denoiser-tzas',
    )
  })

  it('respects a sub-path deploy base (GH Pages style)', () => {
    expect(denoiserWeightsUrl('/sofa-so-good/', 'https://x.github.io/sofa-so-good/')).toBe(
      'https://x.github.io/sofa-so-good/denoiser-tzas',
    )
  })

  it('tolerates a base without a trailing slash', () => {
    expect(denoiserWeightsUrl('/app', 'https://example.com/')).toBe(
      'https://example.com/app/denoiser-tzas',
    )
  })

  it('yields per-model URLs the loader accepts (.tza suffix check)', () => {
    const base = denoiserWeightsUrl('/', 'http://localhost:5173/')
    const model = `${base}/rt_ldr_calb_cnrm_small.tza`
    expect(new URL(model).pathname.endsWith('.tza')).toBe(true)
  })
})
