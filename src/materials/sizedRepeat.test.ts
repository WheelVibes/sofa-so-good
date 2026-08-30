import { describe, expect, it } from 'vitest'
import { FURNITURE_GRAIN_METRES, sizedRepeat } from './furnitureMaterials'

describe('sizedRepeat — one physical grain period, not one tile per face', () => {
  it('derives u and v SEPARATELY from world size, so a face is never stretched', () => {
    // The measured defect: a 0.437 x 1.99 m wardrobe door drawn with one
    // isotropic repeat lands at 0.218 m/tile across and 0.995 up — a 4.6:1
    // smear equal to the face's aspect ratio, which no scalar can undo.
    const [ru, rv] = sizedRepeat(0.437, 1.99)
    expect(ru).not.toBeCloseTo(rv, 2)
    // Both axes land at the SAME physical period.
    expect(0.437 / ru).toBeCloseTo(FURNITURE_GRAIN_METRES, 1)
    expect(1.99 / rv).toBeCloseTo(FURNITURE_GRAIN_METRES, 1)
  })

  it('gives a big carcass and a small drawer front the same period', () => {
    const carcass = sizedRepeat(1.8, 0.42)
    const drawer = sizedRepeat(0.858, 0.185)
    expect(1.8 / carcass[0]).toBeCloseTo(0.858 / drawer[0], 1)
    expect(0.42 / carcass[1]).toBeCloseTo(0.185 / drawer[1], 1)
  })

  it('honours an explicit period', () => {
    const [ru] = sizedRepeat(1.2, 1.2, 0.3)
    expect(1.2 / ru).toBeCloseTo(0.3, 2)
  })

  it('clamps a degenerate edge instead of asking for a 900x tile', () => {
    const [ru] = sizedRepeat(0.001, 1)
    expect(ru).toBeGreaterThanOrEqual(0.05)
    expect(ru).toBeLessThanOrEqual(24)
    expect(sizedRepeat(1000, 1)[0]).toBeLessThanOrEqual(24)
  })

  it('falls back to 1 on bad sizes and to the default on a bad period', () => {
    expect(sizedRepeat(Number.NaN, -3)).toEqual([1, 1])
    expect(sizedRepeat(0, 0)).toEqual([1, 1])
    expect(sizedRepeat(1.8, 0.42, Number.NaN)).toEqual(sizedRepeat(1.8, 0.42))
  })

  it('quantises so near-identical panels share one cached variant', () => {
    expect(sizedRepeat(0.9001, 1)).toEqual(sizedRepeat(0.9004, 1))
  })
})
