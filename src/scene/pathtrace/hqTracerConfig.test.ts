import { describe, expect, it } from 'vitest'
import { HQ_TRACER_CONFIG } from './hqTracerConfig'

describe('HQ_TRACER_CONFIG (PHOTO-PT-TUNE)', () => {
  it('budgets transmissive bounces (glass not black) within the total bounce depth', () => {
    expect(HQ_TRACER_CONFIG.transmissiveBounces).toBeGreaterThan(0)
    expect(HQ_TRACER_CONFIG.transmissiveBounces).toBeLessThanOrEqual(HQ_TRACER_CONFIG.bounces)
  })

  it('enough bounces for interior light transport', () => {
    expect(HQ_TRACER_CONFIG.bounces).toBeGreaterThanOrEqual(8)
  })

  it('clamps glossy fireflies with a factor in [0,1]', () => {
    expect(HQ_TRACER_CONFIG.filterGlossyFactor).toBeGreaterThan(0)
    expect(HQ_TRACER_CONFIG.filterGlossyFactor).toBeLessThanOrEqual(1)
  })

  it('enables multiple importance sampling for faster convergence', () => {
    expect(HQ_TRACER_CONFIG.multipleImportanceSampling).toBe(true)
  })

  it('enables stable noise so the progressive still does not swim', () => {
    expect(HQ_TRACER_CONFIG.stableNoise).toBe(true)
  })
})
