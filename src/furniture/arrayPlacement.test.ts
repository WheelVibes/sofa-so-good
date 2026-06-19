import { describe, expect, it } from 'vitest'
import {
  ARRAY_MAX_COUNT,
  arrayOffsets,
  type GridArrayOptions,
  gridArrayPlacements,
} from './arrayPlacement'

const src = (x: number, z: number, rotation = 0) => ({
  position: [x, z] as [number, number],
  rotation,
})

describe('arrayOffsets', () => {
  it('steps along +X for an unrotated "right" array', () => {
    expect(arrayOffsets(src(0, 0), 3, 0.5, 'right')).toEqual([
      [0.5, 0],
      [1, 0],
      [1.5, 0],
    ])
  })

  it('steps along +Z for an unrotated "forward" array', () => {
    expect(arrayOffsets(src(1, 1), 2, 0.6, 'forward')).toEqual([
      [1, 1.6],
      [1, 2.2],
    ])
  })

  it('steps along -X for a "left" array', () => {
    const offsets = arrayOffsets(src(2, 0), 2, 1, 'left')
    expect(offsets[0][0]).toBeCloseTo(1)
    expect(offsets[0][1]).toBeCloseTo(0)
    expect(offsets[1][0]).toBeCloseTo(0)
    expect(offsets[1][1]).toBeCloseTo(0)
  })

  it('steps along -Z for a "back" array', () => {
    const offsets = arrayOffsets(src(0, 3), 2, 1, 'back')
    expect(offsets[0][0]).toBeCloseTo(0)
    expect(offsets[0][1]).toBeCloseTo(2)
    expect(offsets[1][0]).toBeCloseTo(0)
    expect(offsets[1][1]).toBeCloseTo(1)
  })

  it('honours rotation — a 90° item arrays perpendicular to the unrotated case', () => {
    const [p1] = arrayOffsets(src(0, 0, Math.PI / 2), 1, 1, 'right')
    // local +X rotated by 90° → world -Z (within fp error).
    expect(p1[0]).toBeCloseTo(0)
    expect(p1[1]).toBeCloseTo(-1)
  })

  it('returns nothing for a zero/negative count or spacing', () => {
    expect(arrayOffsets(src(0, 0), 0, 0.5, 'right')).toEqual([])
    expect(arrayOffsets(src(0, 0), 3, 0, 'right')).toEqual([])
    expect(arrayOffsets(src(0, 0), -2, 0.5, 'right')).toEqual([])
  })

  it('floors a fractional count', () => {
    expect(arrayOffsets(src(0, 0), 2.9, 1, 'right')).toHaveLength(2)
  })

  it('caps count at ARRAY_MAX_COUNT', () => {
    expect(arrayOffsets(src(0, 0), 9999, 0.5, 'right')).toHaveLength(ARRAY_MAX_COUNT)
  })
})

describe('gridArrayPlacements', () => {
  const opts = (
    cols: number,
    rows: number,
    colSpacing = 1,
    rowSpacing = 1,
    overrides: Partial<GridArrayOptions> = {},
  ): GridArrayOptions => ({
    cols,
    rows,
    colSpacing,
    rowSpacing,
    ...overrides,
  })

  it('returns empty for a 1×1 grid (nothing to duplicate)', () => {
    expect(gridArrayPlacements(src(0, 0), opts(1, 1))).toHaveLength(0)
  })

  it('1×3 grid (single column, 3 rows) = 2 extra rows', () => {
    const placements = gridArrayPlacements(src(0, 0), opts(1, 3, 1, 2))
    expect(placements).toHaveLength(2)
    // Row 1: forward by 2
    expect(placements[0].position[0]).toBeCloseTo(0)
    expect(placements[0].position[1]).toBeCloseTo(2)
    // Row 2: forward by 4
    expect(placements[1].position[0]).toBeCloseTo(0)
    expect(placements[1].position[1]).toBeCloseTo(4)
  })

  it('3×1 grid (3 cols, 1 row) = 2 extra cols', () => {
    const placements = gridArrayPlacements(src(0, 0), opts(3, 1, 1.5, 1))
    expect(placements).toHaveLength(2)
    expect(placements[0].position[0]).toBeCloseTo(1.5)
    expect(placements[0].position[1]).toBeCloseTo(0)
    expect(placements[1].position[0]).toBeCloseTo(3.0)
    expect(placements[1].position[1]).toBeCloseTo(0)
  })

  it('3×2 grid = 5 extra positions (source is skipped)', () => {
    const placements = gridArrayPlacements(src(0, 0), opts(3, 2, 1, 2))
    expect(placements).toHaveLength(5)

    // Check col/row indexing
    const byKey = Object.fromEntries(placements.map((p) => [`${p.col},${p.row}`, p.position]))
    // (1,0) = 1 col right, 0 rows forward
    expect(byKey['1,0'][0]).toBeCloseTo(1)
    expect(byKey['1,0'][1]).toBeCloseTo(0)
    // (0,1) = 0 cols right, 1 row forward (rowSpacing=2)
    expect(byKey['0,1'][0]).toBeCloseTo(0)
    expect(byKey['0,1'][1]).toBeCloseTo(2)
    // (2,1) = 2 cols right + 1 row forward
    expect(byKey['2,1'][0]).toBeCloseTo(2)
    expect(byKey['2,1'][1]).toBeCloseTo(2)
  })

  it('honours rotation — a 90° item grids in rotated directions', () => {
    const placements = gridArrayPlacements(src(0, 0, Math.PI / 2), opts(2, 1, 1, 1))
    // 2×1: one extra col to the "right" of a 90° item = local +X → world -Z
    expect(placements).toHaveLength(1)
    expect(placements[0].position[0]).toBeCloseTo(0)
    expect(placements[0].position[1]).toBeCloseTo(-1)
  })

  it('colAxis/rowAxis overrides work — left + back', () => {
    const placements = gridArrayPlacements(
      src(2, 2),
      opts(2, 2, 1, 1, { colAxis: 'left', rowAxis: 'back' }),
    )
    // 2×2: 3 extra cells
    expect(placements).toHaveLength(3)
    const byKey = Object.fromEntries(placements.map((p) => [`${p.col},${p.row}`, p.position]))
    // (1,0): 1 col to the left
    expect(byKey['1,0'][0]).toBeCloseTo(1)
    expect(byKey['1,0'][1]).toBeCloseTo(2)
    // (0,1): 1 row back
    expect(byKey['0,1'][0]).toBeCloseTo(2)
    expect(byKey['0,1'][1]).toBeCloseTo(1)
  })

  it('clamps colSpacing/rowSpacing to a minimum to prevent degeneracy', () => {
    // Should not throw and should produce results with tiny but valid spacing
    const placements = gridArrayPlacements(src(0, 0), opts(2, 1, 0, 0))
    expect(placements).toHaveLength(1)
    // positions should be clamped off zero (not NaN)
    expect(Number.isFinite(placements[0].position[0])).toBe(true)
  })

  it('clamps negative spacing', () => {
    const placements = gridArrayPlacements(src(0, 0), opts(2, 1, -5, -5))
    expect(placements).toHaveLength(1)
    expect(Number.isFinite(placements[0].position[0])).toBe(true)
  })

  it('clamps cols/rows to minimum 1', () => {
    expect(gridArrayPlacements(src(0, 0), opts(-1, 0))).toHaveLength(0) // 1×1 → empty
  })

  it('caps total output at ARRAY_MAX_COUNT', () => {
    const placements = gridArrayPlacements(src(0, 0), opts(999, 999, 1, 1))
    expect(placements.length).toBeLessThanOrEqual(ARRAY_MAX_COUNT)
  })
})
