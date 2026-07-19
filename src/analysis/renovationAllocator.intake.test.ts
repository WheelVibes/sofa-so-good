import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, PlanWall } from '../floorplan/types'
import { SCREED } from '../furniture/intakeStates'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildRenovationAllocation } from './renovationAllocator'
import { DEFAULT_PRICE_RULES } from './renovationCost'

/**
 * BSJ-4 — the whole-reno allocator must stay coherent with each seeded intake
 * state: a **bare BTO** (baseline == current shell) has NO hacking line; a
 * **resale strip-out** whose baseline retains a wall the current plan hacked
 * shows a real hacking quantity. Dry rooms on screed still price as flooring.
 */

function room(id: string, w: number, d: number, category: PlanRoom['category']): PlanRoom {
  return { id, name: id, origin: [0, 0], width: w, depth: d, category }
}
function wall(id: string, a: [number, number], b: [number, number]): PlanWall {
  return { id, start: a, end: b, thickness: 'internal' }
}

const ROOMS: PlanRoom[] = [
  room('living', 5, 4, 'living'), // dry
  room('bed', 3, 3, 'bedroom'), // dry
  room('bath', 2, 2, 'bath'), // wet
  room('kitchen', 3, 2, 'kitchen'), // wet
]

const KEPT_WALL = wall('w-kept', [0, 0], [4, 0])

const BARE_PLAN: FloorPlan = {
  id: 'bare',
  name: 'Bare BTO',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls: [KEPT_WALL],
  openings: [],
  rooms: ROOMS,
}

const CATALOG: Record<string, FurnitureDef> = {
  toilet: { defaultFootprint: { w: 0.4, d: 0.6, h: 0.8 }, category: 'bathroom' } as FurnitureDef,
}

// Dry rooms on screed; wet rooms retain their tiled floor.
const SCREED_FLOOR: Record<string, string> = {
  living: SCREED,
  bed: SCREED,
  bath: 'porcelain-tile',
  kitchen: 'porcelain-tile',
}

describe('renovationAllocator — bare BTO', () => {
  it('has no hacking line when the baseline equals the seeded shell', () => {
    const a = buildRenovationAllocation({
      plan: BARE_PLAN,
      items: [],
      catalog: CATALOG,
      floorFinishes: SCREED_FLOOR,
      wallFinishes: {},
      rules: DEFAULT_PRICE_RULES,
      baselinePlan: BARE_PLAN, // captured as the seeded shell → zero diff
    })
    const byId = Object.fromEntries(a.lines.map((l) => [l.id, l]))
    expect(byId.hacking).toBeUndefined()
    // Dry rooms still price as flooring (living 20 + bed 9 = 29 m²).
    expect(byId.flooring?.quantity).toBeCloseTo(29, 5)
    // No carpentry / glass with an empty bare shell.
    expect(byId.carpentry).toBeUndefined()
    expect(byId.glass).toBeUndefined()
  })
})

describe('renovationAllocator — resale strip-out', () => {
  it('prices a real hacking length when the baseline retains a hacked wall', () => {
    // The as-handed-over baseline had an extra partition the strip-out removed.
    const baseline: FloorPlan = {
      ...BARE_PLAN,
      walls: [KEPT_WALL, wall('w-hacked', [0, 0], [3, 0])],
    }
    const a = buildRenovationAllocation({
      plan: BARE_PLAN, // current = the hacked shell (only the kept wall)
      items: [{ defId: 'toilet', props: {} } as FurnitureItem], // retained fitting
      catalog: CATALOG,
      floorFinishes: SCREED_FLOOR,
      wallFinishes: {},
      rules: DEFAULT_PRICE_RULES,
      baselinePlan: baseline,
    })
    const byId = Object.fromEntries(a.lines.map((l) => [l.id, l]))
    expect(byId.hacking).toBeDefined()
    expect(byId.hacking.unit).toBe('lin.m')
    expect(byId.hacking.quantity).toBeCloseTo(3, 5)
    // The retained toilet still shows as a fixture.
    expect(byId.fixtures?.quantity).toBe(1)
  })
})
