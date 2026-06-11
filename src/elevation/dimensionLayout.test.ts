import { describe, expect, it } from 'vitest'
import { approxTextWidth, staggerDimensionRows } from './dimensionLayout'

describe('staggerDimensionRows', () => {
  it('keeps non-colliding labels on row 0', () => {
    expect(
      staggerDimensionRows([
        { center: 0.5, width: 0.4 },
        { center: 1.5, width: 0.4 },
        { center: 3.0, width: 0.4 },
      ]),
    ).toEqual([0, 0, 0])
  })

  it('staggers colliding neighbours into deeper rows', () => {
    const rows = staggerDimensionRows([
      { center: 0.5, width: 0.6 },
      { center: 0.8, width: 0.6 }, // overlaps the first
      { center: 1.1, width: 0.6 }, // overlaps both
    ])
    expect(rows[0]).toBe(0)
    expect(rows[1]).toBe(1)
    expect(rows[2]).toBe(2)
  })

  it('reuses a row once the previous label in it has ended', () => {
    const rows = staggerDimensionRows([
      { center: 0.5, width: 0.4 },
      { center: 0.7, width: 0.4 }, // collides with #1 → row 1
      { center: 2.0, width: 0.4 }, // clear of both → back to row 0
    ])
    expect(rows).toEqual([0, 1, 0])
  })

  it('returns rows in input order regardless of horizontal order', () => {
    const rows = staggerDimensionRows([
      { center: 2.0, width: 0.5 },
      { center: 0.5, width: 0.5 },
      { center: 2.3, width: 0.5 }, // collides with #0
    ])
    expect(rows).toEqual([0, 0, 1])
  })

  it('approxTextWidth scales with length and font size', () => {
    expect(approxTextWidth('1.20 m', 0.2)).toBeCloseTo(6 * 0.2 * 0.62, 6)
    expect(approxTextWidth('', 0.2)).toBe(0)
  })
})
