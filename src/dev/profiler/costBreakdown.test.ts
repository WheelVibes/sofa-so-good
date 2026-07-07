import { describe, expect, it, vi } from 'vitest'
import { COST_SWEEP, runSweep, type SweepStep } from './costBreakdown'

describe('COST_SWEEP', () => {
  it('covers the heavy render effects', () => {
    const keys = COST_SWEEP.map((s) => s.key)
    expect(keys).toContain('shadowMapSize')
    expect(keys).toContain('postprocessing')
    expect(keys).toContain('ibl')
    expect(keys).toContain('maxFixtureLights')
    expect(keys).toContain('dprMax')
  })
  it('disables shadows/lights by dropping them to 0', () => {
    expect(COST_SWEEP.find((s) => s.key === 'shadowMapSize')?.disabledValue).toBe(0)
    expect(COST_SWEEP.find((s) => s.key === 'maxFixtureLights')?.disabledValue).toBe(0)
    expect(COST_SWEEP.find((s) => s.key === 'postprocessing')?.disabledValue).toBe(false)
  })
})

describe('runSweep', () => {
  const steps: SweepStep[] = [
    { key: 'postprocessing', label: 'Post', disabledValue: false },
    { key: 'ibl', label: 'IBL', disabledValue: false },
  ]

  it('ranks effects by frame-time saved, computes deltas + fps gain', async () => {
    // Baseline 20ms/frame (50fps). Disabling Post → 10ms (100fps); IBL → 18ms.
    const measure = vi.fn(async (override?: { key: string }) => {
      if (!override) return 20
      if (override.key === 'postprocessing') return 10
      if (override.key === 'ibl') return 18
      return 20
    })
    const out = await runSweep(steps, measure)
    expect(out.map((e) => e.key)).toEqual(['postprocessing', 'ibl']) // sorted desc by cost
    expect(out[0]).toMatchObject({ label: 'Post', baselineMs: 20, disabledMs: 10, deltaMs: 10 })
    // fpsGain = 1000/10 - 1000/20 = 100 - 50 = 50
    expect(out[0].fpsGain).toBeCloseTo(50, 5)
    expect(out[1]).toMatchObject({ key: 'ibl', deltaMs: 2 })
  })

  it('measures baseline once and each step once', async () => {
    const measure = vi.fn(async () => 16)
    await runSweep(steps, measure)
    expect(measure).toHaveBeenCalledTimes(3) // baseline + 2 steps
  })

  it('reports progress per step', async () => {
    const measure = async () => 16
    const onProgress = vi.fn()
    await runSweep(steps, measure, onProgress)
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'Post')
    expect(onProgress).toHaveBeenCalledWith(2, 2, 'IBL')
  })
})
