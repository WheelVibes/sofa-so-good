import { describe, expect, it } from 'vitest'
import { buildUpholsteryHeight, DEFAULT_SEAM_PARAMS, type SeamParams } from './upholsterySeams'

const SIZE = 64

describe('buildUpholsteryHeight (RZ6 upholstery seams + wrinkle)', () => {
  it('returns a row-major height field of size*size, all in 0..1', () => {
    const h = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(h).toBeInstanceOf(Float32Array)
    expect(h.length).toBe(SIZE * SIZE)
    for (let i = 0; i < h.length; i++) {
      expect(h[i]).toBeGreaterThanOrEqual(0)
      expect(h[i]).toBeLessThanOrEqual(1)
      expect(Number.isFinite(h[i])).toBe(true)
    }
  })

  it('is deterministic for the same seed + params', () => {
    const a = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    const b = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('changes with the seed (not a constant field)', () => {
    const a = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    const b = buildUpholsteryHeight(SIZE, 0x9999, DEFAULT_SEAM_PARAMS)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('seam=0 + wrinkle=0 drops both channels (differs from full default)', () => {
    const plain: SeamParams = { seam: 0, wrinkle: 0, panels: 2 }
    const weaveOnly = buildUpholsteryHeight(SIZE, 0x4242, plain)
    const full = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(Array.from(weaveOnly)).not.toEqual(Array.from(full))
  })

  it('seam channel carves a recess on the panel edge (lower than mid-panel)', () => {
    // panels=2 → seams at u=0, 0.5, 1. Compare the height on the seam line at
    // u=0.5 against mid-panel u=0.25, averaged down a column to cancel the
    // weave/wrinkle noise so the seam valley dominates.
    const seamOnly: SeamParams = { seam: 1, wrinkle: 0, panels: 2 }
    const h = buildUpholsteryHeight(SIZE, 0x4242, seamOnly)
    const xSeam = Math.round(0.5 * SIZE)
    const xMid = Math.round(0.25 * SIZE)
    let seamSum = 0
    let midSum = 0
    for (let y = 0; y < SIZE; y++) {
      seamSum += h[y * SIZE + xSeam]
      midSum += h[y * SIZE + xMid]
    }
    expect(seamSum / SIZE).toBeLessThan(midSum / SIZE)
  })

  it('wrinkle adds relief variance over the weave-only baseline', () => {
    const variance = (h: Float32Array) => {
      let mean = 0
      for (const v of h) mean += v
      mean /= h.length
      let s = 0
      for (const v of h) s += (v - mean) ** 2
      return s / h.length
    }
    const weaveOnly = buildUpholsteryHeight(SIZE, 0x4242, { seam: 0, wrinkle: 0, panels: 2 })
    const withWrinkle = buildUpholsteryHeight(SIZE, 0x4242, { seam: 0, wrinkle: 1, panels: 2 })
    expect(variance(withWrinkle)).toBeGreaterThan(variance(weaveOnly))
  })

  it('clamps a degenerate panels value to a valid grid (no NaN)', () => {
    const h = buildUpholsteryHeight(SIZE, 0x4242, { seam: 1, wrinkle: 1, panels: 0 })
    expect(h.length).toBe(SIZE * SIZE)
    for (let i = 0; i < h.length; i++) expect(Number.isFinite(h[i])).toBe(true)
  })
})
