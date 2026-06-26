import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanWall } from '../floorplan/types'
import {
  buildThermalReport,
  DEFAULT_GLAZING_KIND,
  DEFAULT_WALL_KIND,
  glazingUKind,
  thermalKindLabel,
  U_VALUES,
  wallUKind,
} from './thermalAnalysis'

/** A straight wall from (x0,z0) to (x1,z1); length = hypot. */
const wall = (
  id: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  thickness: 'external' | 'internal' = 'external',
): PlanWall => ({ id, start: [x0, z0], end: [x1, z1], thickness })

/** A window opening on a wall (head − sill = height). */
const win = (id: string, wallId: string, width: number, sill = 1, head = 2): PlanOpening => ({
  id,
  kind: 'window',
  wallId,
  offset: 0,
  width,
  sill,
  head,
})

const plan = (
  walls: PlanWall[],
  openings: PlanOpening[] = [],
  extra: Partial<FloorPlan> = {},
): FloorPlan => ({
  id: 'p',
  name: 'Test plan',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls,
  openings,
  rooms: [],
  ...extra,
})

describe('U_VALUES table', () => {
  it('carries the documented representative SG values', () => {
    expect(U_VALUES.wall.rc).toBe(2.0)
    expect(U_VALUES.glazing.single).toBe(5.7)
    expect(U_VALUES.glazing.double).toBe(2.8)
  })
})

describe('buildThermalReport — known areas + U → exact totals', () => {
  it('sums exterior wall area at the RC default and computes the index', () => {
    // Two external walls: 4 m + 6 m = 10 m of wall × 2.8 m height = 28 m².
    const r = buildThermalReport(plan([wall('w1', 0, 0, 4, 0), wall('w2', 0, 0, 0, 6)]))
    expect(r.opaqueWallSqm).toBeCloseTo(28, 6)
    expect(r.glazingSqm).toBe(0)
    expect(r.totalEnvelopeSqm).toBeCloseTo(28, 6)
    // averageU = RC (no glazing), index = 28 × 2.0 = 56.
    expect(r.averageU).toBeCloseTo(2.0, 6)
    expect(r.heatTransferIndex).toBeCloseTo(56, 6)
    expect(r.glazingRatio).toBe(0)
    expect(r.surfaces).toHaveLength(1)
    expect(r.surfaces[0]).toMatchObject({ category: 'wall', kind: 'rc', uValue: 2.0 })
  })

  it('splits a window out of the opaque wall as single glazing + weights the average U', () => {
    // One 10 m external wall × 2.8 m = 28 m² gross; a 2 m × 1 m window = 2 m².
    const r = buildThermalReport(plan([wall('w1', 0, 0, 10, 0)], [win('o1', 'w1', 2, 1, 2)]))
    expect(r.glazingSqm).toBeCloseTo(2, 6)
    expect(r.opaqueWallSqm).toBeCloseTo(26, 6) // 28 − 2
    expect(r.totalEnvelopeSqm).toBeCloseTo(28, 6)
    expect(r.glazingRatio).toBeCloseTo(2 / 28, 6)
    // index = 26 × 2.0 + 2 × 5.7 = 52 + 11.4 = 63.4
    expect(r.heatTransferIndex).toBeCloseTo(63.4, 6)
    // averageU = 63.4 / 28
    expect(r.averageU).toBeCloseTo(63.4 / 28, 6)
    expect(r.surfaces).toHaveLength(2)
    // Opaque wall sorts before glazing.
    expect(r.surfaces[0].category).toBe('wall')
    expect(r.surfaces[1]).toMatchObject({ category: 'glazing', kind: 'single', uValue: 5.7 })
  })
})

describe('buildThermalReport — edge cases', () => {
  it('returns a fully-zeroed digest for a bare-shell / empty plan (no NaN)', () => {
    const r = buildThermalReport(plan([]))
    expect(r.opaqueWallSqm).toBe(0)
    expect(r.glazingSqm).toBe(0)
    expect(r.totalEnvelopeSqm).toBe(0)
    expect(r.glazingRatio).toBe(0)
    expect(r.averageU).toBe(0)
    expect(r.heatTransferIndex).toBe(0)
    expect(r.surfaces).toEqual([])
    expect(Number.isNaN(r.averageU)).toBe(false)
  })

  it('returns zero envelope for an all-interior plan (no exterior walls)', () => {
    const r = buildThermalReport(
      plan([wall('w1', 0, 0, 4, 0, 'internal'), wall('w2', 0, 0, 0, 3, 'internal')]),
    )
    expect(r.totalEnvelopeSqm).toBe(0)
    expect(r.averageU).toBe(0)
    expect(r.surfaces).toEqual([])
  })

  it('ignores windows on interior walls (only exterior glazing counts)', () => {
    const r = buildThermalReport(
      plan(
        [wall('ext', 0, 0, 4, 0, 'external'), wall('int', 0, 0, 0, 4, 'internal')],
        [win('o1', 'int', 2, 1, 2)],
      ),
    )
    expect(r.glazingSqm).toBe(0)
    expect(r.opaqueWallSqm).toBeCloseTo(4 * 2.8, 6)
  })

  it('uses a finish default when a finish maps to no entry (falls back to RC)', () => {
    const r = buildThermalReport(plan([wall('w1', 0, 0, 5, 0)]), {
      floor: {},
      walls: { living: 'wall-paint-white' }, // no U-keyword → RC default
    })
    expect(r.surfaces[0]).toMatchObject({ kind: 'rc', uValue: 2.0 })
  })

  it('refines the opaque-wall U from a recognised finish hint (cladding)', () => {
    const r = buildThermalReport(plan([wall('w1', 0, 0, 5, 0)]), {
      floor: {},
      walls: { living: 'wall-insulated-cladding' },
    })
    expect(r.surfaces[0]).toMatchObject({ kind: 'cladding', uValue: U_VALUES.wall.cladding })
  })
})

describe('buildThermalReport — multi-storey', () => {
  it('sums exterior walls + windows across ground and upper storeys', () => {
    const p = plan([wall('g1', 0, 0, 5, 0)], [win('go', 'g1', 1, 1, 2)], {
      upperLevels: [
        {
          id: 'l1',
          name: 'Upper',
          elevation: 3,
          walls: [wall('u1', 0, 0, 5, 0)],
          openings: [win('uo', 'u1', 1, 1, 2)],
          rooms: [],
        },
      ],
    })
    const r = buildThermalReport(p)
    // Two 5 m walls × 2.8 m = 28 m² gross; two 1 m² windows = 2 m² glazing.
    expect(r.glazingSqm).toBeCloseTo(2, 6)
    expect(r.opaqueWallSqm).toBeCloseTo(26, 6)
    expect(r.totalEnvelopeSqm).toBeCloseTo(28, 6)
    // index = 26 × 2.0 + 2 × 5.7 = 63.4
    expect(r.heatTransferIndex).toBeCloseTo(63.4, 6)
  })

  it('honours a per-level ceiling height override', () => {
    const p = plan([wall('g1', 0, 0, 5, 0)], [], {
      upperLevels: [
        {
          id: 'l1',
          name: 'Upper',
          elevation: 3,
          ceilingHeight: 4,
          walls: [wall('u1', 0, 0, 5, 0)],
          openings: [],
          rooms: [],
        },
      ],
    })
    const r = buildThermalReport(p)
    // ground 5 × 2.8 = 14, upper 5 × 4 = 20 → 34 m².
    expect(r.opaqueWallSqm).toBeCloseTo(34, 6)
  })
})

describe('classifiers + labels', () => {
  it('wallUKind classifies by keyword and defaults to RC', () => {
    expect(wallUKind('wall-cladding')).toBe('cladding')
    expect(wallUKind('drywall-partition')).toBe('lightweight')
    expect(wallUKind('brick-red')).toBe('brick')
    expect(wallUKind('wall-paint')).toBe(DEFAULT_WALL_KIND)
    expect(wallUKind(null)).toBe(DEFAULT_WALL_KIND)
    expect(wallUKind(undefined)).toBe(DEFAULT_WALL_KIND)
  })

  it('glazingUKind classifies by keyword and defaults to single', () => {
    expect(glazingUKind('low-e')).toBe('low-e')
    expect(glazingUKind('double-glazed')).toBe('double')
    expect(glazingUKind('clear')).toBe(DEFAULT_GLAZING_KIND)
    expect(glazingUKind(null)).toBe(DEFAULT_GLAZING_KIND)
  })

  it('thermalKindLabel renders friendly names', () => {
    expect(thermalKindLabel('wall', 'rc')).toBe('RC external wall')
    expect(thermalKindLabel('glazing', 'single')).toBe('Single glazing')
    expect(thermalKindLabel('glazing', 'low-e')).toBe('Low-E double glazing')
  })
})
