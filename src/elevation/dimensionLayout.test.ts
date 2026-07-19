import { describe, expect, it } from 'vitest'
import { approxTextWidth, staggerDimensionRows, staggerMountHeightColumns } from './dimensionLayout'

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

describe('staggerMountHeightColumns (H3)', () => {
  it('keeps well-separated items on column 0', () => {
    expect(
      staggerMountHeightColumns([
        { x: 0.5, height: 1.1 },
        { x: 3.0, height: 1.45 },
      ]),
    ).toEqual([0, 0])
  })

  it('fans out two items stacked close together at a similar height', () => {
    const cols = staggerMountHeightColumns([
      { x: 1.0, height: 1.1 },
      { x: 1.1, height: 1.15 }, // close in x AND height → collides
    ])
    expect(cols[0]).toBe(0)
    expect(cols[1]).toBe(1)
  })

  it('does not fan out close-x items whose heights are far apart', () => {
    const cols = staggerMountHeightColumns([
      { x: 1.0, height: 0.9 },
      { x: 1.05, height: 2.4 }, // same wall segment, very different height
    ])
    expect(cols).toEqual([0, 0])
  })

  it('returns columns in input order regardless of x order', () => {
    const cols = staggerMountHeightColumns([
      { x: 2.0, height: 1.1 },
      { x: 0.5, height: 1.1 },
      { x: 2.05, height: 1.1 }, // collides with #0
    ])
    expect(cols).toEqual([0, 0, 1])
  })
})
