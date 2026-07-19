import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildRenovationAllocation } from './renovationAllocator'
import { DEFAULT_PRICE_RULES } from './renovationCost'

function room(id: string, w: number, d: number, category: PlanRoom['category']): PlanRoom {
  return { id, name: id, origin: [0, 0], width: w, depth: d, category }
}

const PLAN: FloorPlan = {
  id: 't',
  name: 't',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls: [],
  openings: [],
  rooms: [
    room('living', 5, 4, 'living'),
    room('bath', 2, 2, 'bath'), // wet, no shower placed → full-perimeter 1800
    room('kitchen', 3, 2, 'kitchen'), // wet
  ],
}

const base = {
  plan: PLAN,
  items: [] as FurnitureItem[],
  catalog: {} as Record<string, FurnitureDef>,
  floorFinishes: { living: 'oak-wood' } as Record<string, string>,
  wallFinishes: {} as Record<string, string>,
  rules: DEFAULT_PRICE_RULES,
}

describe('renovationAllocator — waterproofing sub-line (BSJ-7)', () => {
  it('omits the waterproofing line when the flag input is off (no regression)', () => {
    const alloc = buildRenovationAllocation({ ...base, waterproofing: false })
    expect(alloc.lines.find((l) => l.id === 'waterproofing')).toBeUndefined()
    // The tiling line is present + unchanged by the flag.
    expect(alloc.lines.find((l) => l.id === 'tiling')).toBeDefined()
  })

  it('adds a waterproofing line = membrane area × rate when the flag is on', () => {
    const alloc = buildRenovationAllocation({ ...base, waterproofing: true })
    const wp = alloc.lines.find((l) => l.id === 'waterproofing')
    expect(wp).toBeDefined()
    // bath 4 + 8×0.3 + 8×1.5 = 18.4; kitchen 6 + 10×0.3 = 9 → 27.4 m²
    expect(wp!.quantity).toBeCloseTo(27.4, 1)
    expect(wp!.rate).toBeCloseTo(DEFAULT_PRICE_RULES.trades.waterproofingPerM2)
    expect(wp!.stage).toBe('Tiling & waterproofing')
    // Tiling line unchanged vs the flag-off run.
    const off = buildRenovationAllocation({ ...base, waterproofing: false })
    expect(alloc.lines.find((l) => l.id === 'tiling')!.subtotal).toBe(
      off.lines.find((l) => l.id === 'tiling')!.subtotal,
    )
  })
})
