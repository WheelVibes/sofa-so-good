import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildRenovationAllocation } from './renovationAllocator'
import { DEFAULT_PRICE_RULES, mergePriceRules } from './renovationCost'

// --- Minimal synthetic fixtures -------------------------------------------

function room(
  id: string,
  name: string,
  w: number,
  d: number,
  category: PlanRoom['category'],
): PlanRoom {
  return { id, name, origin: [0, 0], width: w, depth: d, category }
}

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Test 4-room',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls: [],
  openings: [{ id: 'w1', kind: 'window', wallId: 'x', offset: 0, width: 2, sill: 0.9, head: 2.1 }],
  rooms: [
    room('living', 'Living', 5, 4, 'living'), // dry, 20 m²
    room('bed', 'Bedroom', 3, 3, 'bedroom'), // dry, 9 m²
    room('bath', 'Bathroom', 2, 2, 'bath'), // wet, 4 m²
    room('kitchen', 'Kitchen', 3, 2, 'kitchen'), // wet, 6 m²
  ],
}

const CATALOG: Record<string, FurnitureDef> = {
  'kitchen-cabinets': {
    defaultFootprint: { w: 2.4, d: 0.6, h: 0.9 },
    category: 'kitchen',
  } as FurnitureDef,
  'wardrobe-3door': {
    defaultFootprint: { w: 1.8, d: 0.6, h: 2.1 },
    category: 'storage',
  } as FurnitureDef,
  'shower-screen': {
    defaultFootprint: { w: 0.9, d: 0.05, h: 2.0 },
    category: 'bathroom',
  } as FurnitureDef,
  toilet: { defaultFootprint: { w: 0.4, d: 0.6, h: 0.8 }, category: 'bathroom' } as FurnitureDef,
  'bathroom-sink': {
    defaultFootprint: { w: 0.5, d: 0.4, h: 0.85 },
    category: 'bathroom',
  } as FurnitureDef,
  sofa: { defaultFootprint: { w: 2.0, d: 0.9, h: 0.8 }, category: 'seating' } as FurnitureDef,
}

function item(defId: string, props: Record<string, unknown> = {}): FurnitureItem {
  return { defId, props } as FurnitureItem
}

const ITEMS: FurnitureItem[] = [
  item('kitchen-cabinets', { width: 2.4 }),
  item('wardrobe-3door', { width: 1.8 }),
  item('shower-screen', { width: 0.9, height: 2.0 }),
  item('toilet'),
  item('bathroom-sink'),
  item('sofa'),
]

const FINISHES_FLOOR: Record<string, string> = {
  living: 'oak-wood',
  bed: 'vinyl-plank',
  bath: 'porcelain-tile',
  kitchen: 'porcelain-tile',
}
const FINISHES_WALL: Record<string, string> = {}

function baseInput() {
  return {
    plan: PLAN,
    items: ITEMS,
    catalog: CATALOG,
    floorFinishes: FINISHES_FLOOR,
    wallFinishes: FINISHES_WALL,
    rules: DEFAULT_PRICE_RULES,
  }
}

describe('buildRenovationAllocation', () => {
  it('derives trade quantities from the design (no NaN / zero noise)', () => {
    const a = buildRenovationAllocation(baseInput())
    const byId = Object.fromEntries(a.lines.map((l) => [l.id, l]))

    // Wet tiling: bath (4) + kitchen (6) floor = 10 m²; walls 2*(2+2)*2.8 + 2*(3+2)*2.8
    // = 22.4 + 28 = 50.4 m². Total tiling qty 60.4 m².
    expect(byId.tiling.unit).toBe('m²')
    expect(byId.tiling.quantity).toBeCloseTo(60.4, 1)

    // Flooring (dry): living 20 + bed 9 = 29 m².
    expect(byId.flooring.quantity).toBeCloseTo(29, 5)

    // Carpentry: 2.4 (cabinets) + 1.8 (wardrobe) = 4.2 lin.m.
    expect(byId.carpentry.unit).toBe('lin.m')
    expect(byId.carpentry.quantity).toBeCloseTo(4.2, 5)
    expect(byId.carpentry.subtotal).toBe(Math.round(4.2 * DEFAULT_PRICE_RULES.carpentryPerM))

    // Glass: shower screen 0.9 * 2.0 = 1.8 m².
    expect(byId.glass.quantity).toBeCloseTo(1.8, 5)

    // Fixtures: shower-screen is glass (not a fixture); toilet + bathroom-sink = 2.
    expect(byId.fixtures.quantity).toBe(2)
    expect(byId.fixtures.unit).toBe('no.')

    // Aircon: one indoor unit per HABITABLE room (living + bedroom); wet rooms
    // (bath, kitchen) don't get a unit → 2.
    expect(byId.aircon.quantity).toBe(2)

    // No line has a zero / NaN quantity or subtotal.
    for (const l of a.lines) {
      expect(l.quantity).toBeGreaterThan(0)
      expect(l.subtotal).toBeGreaterThan(0)
      expect(Number.isNaN(l.rate)).toBe(false)
    }
  })

  it('has no ceiling / hacking line without a treatment or baseline', () => {
    const a = buildRenovationAllocation(baseInput())
    expect(a.lines.find((l) => l.id === 'ceiling')).toBeUndefined()
    expect(a.lines.find((l) => l.id === 'hacking')).toBeUndefined()
  })

  it('adds a hacking line only when a baseline plan differs', () => {
    const baseline: FloorPlan = {
      ...PLAN,
      walls: [{ id: 'demo', start: [0, 0], end: [4, 0], thickness: 'internal' }],
    }
    const a = buildRenovationAllocation({ ...baseInput(), baselinePlan: baseline })
    const hacking = a.lines.find((l) => l.id === 'hacking')
    expect(hacking).toBeDefined()
    expect(hacking?.quantity).toBeCloseTo(4, 5)
    expect(hacking?.subtotal).toBe(Math.round(4 * DEFAULT_PRICE_RULES.trades.hackingPerM))
  })

  it('adds a ceiling line for rooms with a non-flat ceiling treatment', () => {
    const plan: FloorPlan = {
      ...PLAN,
      rooms: PLAN.rooms.map((r) =>
        r.id === 'living' ? { ...r, ceiling: { style: 'tray' } } : r,
      ) as PlanRoom[],
    }
    const a = buildRenovationAllocation({ ...baseInput(), plan })
    const ceiling = a.lines.find((l) => l.id === 'ceiling')
    expect(ceiling?.quantity).toBeCloseTo(20, 5)
  })

  it('reuses PriceRules rates (a custom rate card changes the subtotals)', () => {
    const cheap = buildRenovationAllocation(baseInput())
    const dear = buildRenovationAllocation({
      ...baseInput(),
      rules: mergePriceRules({ carpentryPerM: 1000, trades: { glassPerM2: 999 } }),
    })
    const cCarp = cheap.lines.find((l) => l.id === 'carpentry')!
    const dCarp = dear.lines.find((l) => l.id === 'carpentry')!
    expect(dCarp.subtotal).toBeGreaterThan(cCarp.subtotal)
    expect(dCarp.subtotal).toBe(Math.round(4.2 * 1000))
    const dGlass = dear.lines.find((l) => l.id === 'glass')!
    expect(dGlass.subtotal).toBe(Math.round(1.8 * 999))
  })

  it('computes contingency + total', () => {
    const a = buildRenovationAllocation(baseInput())
    expect(a.contingencyPct).toBe(DEFAULT_PRICE_RULES.trades.contingencyPct)
    expect(a.contingency).toBe(Math.round((a.subtotal * a.contingencyPct) / 100))
    expect(a.total).toBe(a.subtotal + a.contingency)
    expect(a.benchmarks.length).toBeGreaterThan(0)
  })

  it('compares against a budget target when set', () => {
    const a = buildRenovationAllocation({ ...baseInput(), budgetTarget: 50000 })
    expect(a.target).toBe(50000)
    expect(a.overUnder).toBe(a.total - 50000)
    const none = buildRenovationAllocation(baseInput())
    expect(none.target).toBeUndefined()
    expect(none.overUnder).toBeUndefined()
  })

  it('tolerates an empty plan without throwing (no lines)', () => {
    const empty: FloorPlan = { ...PLAN, rooms: [], openings: [] }
    const a = buildRenovationAllocation({
      ...baseInput(),
      plan: empty,
      items: [],
      floorFinishes: {},
    })
    expect(a.lines).toEqual([])
    expect(a.subtotal).toBe(0)
    expect(a.total).toBe(0)
  })
})
