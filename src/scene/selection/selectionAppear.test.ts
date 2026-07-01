import { describe, expect, it } from 'vitest'
import { APPEAR_FROM, APPEAR_MS, appearEase, appearScale } from './selectionAppear'

describe('selectionAppear — appearEase', () => {
  it('pins endpoints and decelerates (ease-out)', () => {
    expect(appearEase(0)).toBe(0)
    expect(appearEase(1)).toBe(1)
    expect(appearEase(0.5)).toBeGreaterThan(0.5)
  })
  it('clamps out-of-range input', () => {
    expect(appearEase(-1)).toBe(0)
    expect(appearEase(3)).toBe(1)
  })
})

describe('selectionAppear — appearScale', () => {
  it('starts at APPEAR_FROM and settles at exactly 1', () => {
    expect(appearScale(0)).toBeCloseTo(APPEAR_FROM, 6)
    expect(appearScale(APPEAR_MS)).toBe(1)
    expect(appearScale(APPEAR_MS + 50)).toBe(1)
  })
  it('is monotonically non-decreasing and within [APPEAR_FROM, 1]', () => {
    let prev = -1
    for (let ms = 0; ms <= APPEAR_MS; ms += APPEAR_MS / 20) {
      const s = appearScale(ms)
      expect(s).toBeGreaterThanOrEqual(APPEAR_FROM - 1e-9)
      expect(s).toBeLessThanOrEqual(1 + 1e-9)
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = s
    }
  })
})
