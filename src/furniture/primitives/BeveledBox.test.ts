import { describe, expect, it } from 'vitest'
import { safeBevelRadius } from './BeveledBox'

describe('safeBevelRadius', () => {
  it('uses the full target chamfer when the box is thick enough', () => {
    // A 1.4 × 0.04 × 0.8 tabletop: thinnest side 0.04, 40% = 0.016 > 0.007.
    expect(safeBevelRadius(1.4, 0.04, 0.8)).toBeCloseTo(0.007)
  })

  it('clamps to 40% of the thinnest side so RoundedBox never self-intersects', () => {
    // A 10 mm panel: 40% = 4 mm, below the 7 mm target.
    expect(safeBevelRadius(0.5, 0.01, 0.5)).toBeCloseTo(0.004)
    // Radius must stay strictly below half the min dimension.
    expect(safeBevelRadius(0.5, 0.01, 0.5)).toBeLessThan(0.01 / 2)
  })

  it('honours a custom target', () => {
    expect(safeBevelRadius(1, 1, 1, 0.02)).toBeCloseTo(0.02)
  })

  it('never returns a negative radius (degenerate dimensions)', () => {
    expect(safeBevelRadius(0, 0, 0)).toBe(0)
    expect(safeBevelRadius(-0.5, 0.04, 0.5)).toBeGreaterThanOrEqual(0)
  })
})
