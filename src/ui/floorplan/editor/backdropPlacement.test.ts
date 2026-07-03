import { describe, expect, it } from 'vitest'
import {
  centerBackdrop,
  initialBackdropPlacement,
  rescaleBackdropAnchored,
} from './backdropPlacement'

describe('initialBackdropPlacement', () => {
  it('uniform-fits a wide image to 90% of the plan and centres it', () => {
    // image 1000x500 px, plan 10x8 m → limiting axis is width: 10/1000*0.9
    const p = initialBackdropPlacement(1000, 500, 10, 8)
    expect(p.mPerPx).toBeCloseTo(0.009)
    // metric size 9 x 4.5 → top-left at centre minus half-size
    expect(p.ox).toBeCloseTo(10 / 2 - 9 / 2)
    expect(p.oz).toBeCloseTo(8 / 2 - 4.5 / 2)
  })

  it('uniform-fits a tall image on the depth axis', () => {
    // image 500x1000 px, plan 10x8 m → limiting axis is depth: 8/1000*0.9
    const p = initialBackdropPlacement(500, 1000, 10, 8)
    expect(p.mPerPx).toBeCloseTo(0.0072)
    expect(p.oz).toBeCloseTo(8 / 2 - (1000 * 0.0072) / 2)
  })

  it('survives degenerate inputs (zero-size image / empty plan)', () => {
    const p = initialBackdropPlacement(0, 0, 0, 0)
    expect(p.mPerPx).toBeGreaterThan(0)
    expect(Number.isFinite(p.ox)).toBe(true)
    expect(Number.isFinite(p.oz)).toBe(true)
  })
})

describe('rescaleBackdropAnchored', () => {
  it('keeps the image point under the anchor fixed across the rescale', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    // anchor world (3, 4) → image px (200, 200)
    const r = rescaleBackdropAnchored(b, 0.02, 3, 4)
    expect(r.mPerPx).toBe(0.02)
    // same image px must map back to the anchor: ox + 200*0.02 === 3
    expect(r.ox + 200 * r.mPerPx).toBeCloseTo(3)
    expect(r.oz + 200 * r.mPerPx).toBeCloseTo(4)
  })

  it('is identity when the scale is unchanged', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    const r = rescaleBackdropAnchored(b, 0.01, 5, 5)
    expect(r).toEqual({ mPerPx: 0.01, ox: 1, oz: 2 })
  })

  it('rejects non-finite / non-positive scales (returns input placement)', () => {
    const b = { mPerPx: 0.01, ox: 1, oz: 2 }
    expect(rescaleBackdropAnchored(b, 0, 3, 4)).toEqual(b)
    expect(rescaleBackdropAnchored(b, Number.NaN, 3, 4)).toEqual(b)
  })
})

describe('centerBackdrop', () => {
  it('centres at the current scale', () => {
    // 1000x500 px at 0.005 m/px → 5 x 2.5 m, plan 10x8
    const r = centerBackdrop({ w: 1000, h: 500, mPerPx: 0.005 }, 10, 8)
    expect(r.ox).toBeCloseTo(2.5)
    expect(r.oz).toBeCloseTo(2.75)
  })
})
