/**
 * New partition walls are PRICED (v0.31.5.407).
 *
 * `WallDiff.addedLengthM` was computed, printed on the report and on the
 * demolition sheet's legend, and never costed — so a design that added
 * partitions was under-budgeted while displaying the added length right beside
 * a total that ignored it. And the omission ran the wrong way: building a
 * partition costs more per metre than hacking one out.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanWall } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { buildRenovationAllocation } from './renovationAllocator'
import { DEFAULT_PRICE_RULES } from './renovationCost'

const wall = (id: string, x1: number, z1: number, x2: number, z2: number, topHeight?: number) =>
  ({
    id,
    start: [x1, z1],
    end: [x2, z2],
    thickness: 'internal',
    ...(topHeight ? { topHeight } : {}),
  }) as PlanWall

function plan(walls: PlanWall[]): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [8, 6],
    ceilingHeight: 2.6,
    walls,
    openings: [],
    rooms: [
      { id: 'r', name: 'Living', origin: [0, 0], width: 8, depth: 6, floor: 'floor-tile-white' },
    ],
  } as unknown as FloorPlan
}

const alloc = (current: FloorPlan, baseline?: FloorPlan) =>
  buildRenovationAllocation({
    plan: current,
    items: [],
    catalog: BUILTIN_CATALOG,
    floorFinishes: {},
    wallFinishes: {},
    rules: DEFAULT_PRICE_RULES,
    ...(baseline ? { baselinePlan: baseline } : {}),
  } as never)

const partitionLine = (a: ReturnType<typeof alloc>) => a.lines.find((l) => l.id === 'partitions')

describe('added partitions are costed', () => {
  const baseline = plan([])
  /** One 4 m wall added against an empty baseline. */
  const withWall = plan([wall('new', 0, 3, 4, 3)])

  it('emits a priced line for a wall present in the design but not the baseline', () => {
    const line = partitionLine(alloc(withWall, baseline))
    expect(line, 'no partitions line — added walls are still free').toBeTruthy()
    // 4 m run x 2.6 m ceiling = 10.4 m² at $100/m².
    expect(line!.quantity).toBeCloseTo(10.4, 2)
    expect(line!.subtotal).toBeCloseTo(1040, 0)
  })

  it('raises the grand total, not just a line', () => {
    // A line that does not reach the total would be decoration.
    expect(alloc(withWall, baseline).total).toBeGreaterThan(alloc(baseline, baseline).total)
  })

  it('charges a HALF-HEIGHT wall less than a full-height one', () => {
    // The reason the rate is per m² rather than per linear metre: a 1.0 m
    // parapet is not the same job as a full-height partition.
    const half = plan([wall('new', 0, 3, 4, 3, 1)])
    const halfLine = partitionLine(alloc(half, baseline))!
    const fullLine = partitionLine(alloc(withWall, baseline))!
    expect(halfLine.subtotal).toBeLessThan(fullLine.subtotal)
    expect(halfLine.quantity).toBeCloseTo(4, 2)
  })

  it('costs MORE to build a wall than to hack the same wall out', () => {
    // The direction the old omission got wrong. Demolishing the 4 m wall
    // (baseline has it, design does not) vs building it.
    const demolished = alloc(baseline, withWall)
    const built = alloc(withWall, baseline)
    const hacking = demolished.lines.find((l) => l.id === 'hacking')!
    expect(hacking.subtotal).toBeGreaterThan(0)
    expect(partitionLine(built)!.subtotal).toBeGreaterThan(hacking.subtotal)
  })

  it('emits nothing without a baseline to diff against', () => {
    // No captured baseline means no "added" — not everything counted as new.
    expect(partitionLine(alloc(withWall))).toBeUndefined()
  })

  it('emits nothing when the design matches its baseline', () => {
    expect(partitionLine(alloc(withWall, withWall))).toBeUndefined()
  })
})
