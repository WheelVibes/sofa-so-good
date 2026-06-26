import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { FinishesByRoom } from '../ui/reportData'
import { buildCostBreakdown, buildCostBreakdownCsv } from './costBreakdownCsv'

const room = (id: string, name: string, over: Partial<PlanRoom> = {}): PlanRoom =>
  ({ id, name, origin: [0, 0], width: 4, depth: 3, ...over }) as PlanRoom

const plan = (rooms: PlanRoom[]): FloorPlan =>
  ({
    id: 'p',
    name: 'My Plan',
    ceilingHeight: 3, // 4×3 room → perimeter 14, wall area 14×3 = 42 m²
    extent: [9, 9],
    walls: [],
    openings: [],
    rooms,
  }) as unknown as FloorPlan

// Real catalog ids so itemPrice resolves from the static table:
//   sofa-3seat → 1200, dining-chair → 90, plant (category fallback decor=60).
const defs: Record<string, FurnitureDef> = {
  'sofa-3seat': { id: 'sofa-3seat', name: 'Sofa', category: 'seating' } as unknown as FurnitureDef,
  'dining-chair': {
    id: 'dining-chair',
    name: 'Chair',
    category: 'seating',
  } as unknown as FurnitureDef,
  'potted-plant': {
    id: 'potted-plant',
    name: 'Plant',
    category: 'decor',
  } as unknown as FurnitureDef,
}

const item = (defId: string, id = defId): FurnitureItem =>
  ({ id, defId, position: [2, 1.5], rotation: 0, props: {} }) as unknown as FurnitureItem

// floor-wood-oak → 'wood' rate 120; wall-paint-white → 'paint' rate 22.
const nameOf = (id: string) =>
  ({ 'floor-wood-oak': 'Oak', 'wall-paint-white': 'White paint' })[id] ?? id

const finishes: FinishesByRoom = {
  floor: { living: 'floor-wood-oak' },
  walls: { living: 'wall-paint-white' },
}

function parse(csv: string): string[][] {
  return csv.split('\r\n').map((line) => line.split(','))
}

describe('buildCostBreakdown', () => {
  it('groups furniture by category with qty + summed price', () => {
    const b = buildCostBreakdown(
      plan([room('living', 'Living')]),
      [item('sofa-3seat', 's1'), item('sofa-3seat', 's2'), item('dining-chair', 'c1')],
      defs,
      undefined,
      nameOf,
    )
    expect(b.furniture).toEqual([
      // 2×1200 + 1×90 = 2490, qty 3, all 'seating'
      { category: 'seating', label: 'Seating', qty: 3, subtotal: 2490 },
    ])
    expect(b.furnitureSubtotal).toBe(2490)
  })

  it('prices finishes via the renovation rate model', () => {
    const b = buildCostBreakdown(plan([room('living', 'Living')]), [], defs, finishes, nameOf)
    // Floor: 4×3 = 12 m² × $120 = 1440. Wall: perimeter 14 × ceiling 3 = 42 m² × $22 = 924.
    const floor = b.finishes.find((f) => f.surface === 'Floor')
    const wall = b.finishes.find((f) => f.surface === 'Wall')
    expect(floor).toMatchObject({ name: 'Oak', rate: 120, cost: 1440 })
    expect(floor?.areaM2).toBeCloseTo(12, 9)
    expect(wall).toMatchObject({ name: 'White paint', rate: 22, cost: 924 })
    expect(wall?.areaM2).toBeCloseTo(42, 9)
    expect(b.renovationSubtotal).toBe(1440 + 924)
  })

  it('grand total reconciles the section subtotals', () => {
    const b = buildCostBreakdown(
      plan([room('living', 'Living')]),
      [item('sofa-3seat'), item('potted-plant')],
      defs,
      finishes,
      nameOf,
    )
    expect(b.grandTotal).toBe(b.furnitureSubtotal + b.renovationSubtotal)
    // 1200 (sofa) + 70 (potted-plant) + 1440 (floor) + 924 (wall) = 3634
    expect(b.grandTotal).toBe(3634)
  })

  it('skips unknown defs and tolerates an empty design', () => {
    const b = buildCostBreakdown(plan([]), [item('ghost')], {}, undefined, nameOf)
    expect(b.furniture).toEqual([])
    expect(b.furnitureSubtotal).toBe(0)
    expect(b.finishes).toEqual([])
    expect(b.renovationSubtotal).toBe(0)
    expect(b.grandTotal).toBe(0)
  })
})

describe('buildCostBreakdownCsv', () => {
  it('emits header, furniture + renovation blocks, subtotals, and a grand total', () => {
    const csv = buildCostBreakdownCsv(
      plan([room('living', 'Living')]),
      [item('sofa-3seat'), item('dining-chair')],
      defs,
      finishes,
      nameOf,
    )
    const rows = parse(csv)
    expect(rows[0]).toEqual([
      'Section',
      'Item',
      'Qty',
      'Area (m²)',
      'Rate (SGD/m²)',
      'Subtotal (SGD)',
    ])
    // Furniture line: seating qty 2 = 1290.
    expect(rows[1]).toEqual(['Furniture', 'Seating', '2', '', '', '1290'])
    expect(rows[2]).toEqual(['Furniture subtotal', '', '', '', '', '1290'])
    // Blank separator.
    expect(rows[3]).toEqual(['', '', '', '', '', ''])
    // Renovation block (floor cost-sorted before wall: 1440 > 924).
    expect(rows[4]).toEqual(['Renovation', 'Oak (Floor)', '', '12', '120', '1440'])
    expect(rows[5]).toEqual(['Renovation', 'White paint (Wall)', '', '42', '22', '924'])
    expect(rows[6]).toEqual(['Renovation subtotal', '', '', '', '', '2364'])
    expect(rows[7]).toEqual(['', '', '', '', '', ''])
    // Grand total = 1290 + 2364 = 3654.
    expect(rows[8]).toEqual(['GRAND TOTAL', '', '', '', '', '3654'])
  })

  it('reconciles: subtotal cells sum to the grand-total cell', () => {
    const csv = buildCostBreakdownCsv(
      plan([room('living', 'Living')]),
      [item('sofa-3seat'), item('potted-plant')],
      defs,
      finishes,
      nameOf,
    )
    const rows = parse(csv)
    const furnSub = Number(rows.find((r) => r[0] === 'Furniture subtotal')![5])
    const renoSub = Number(rows.find((r) => r[0] === 'Renovation subtotal')![5])
    const grand = Number(rows.find((r) => r[0] === 'GRAND TOTAL')![5])
    expect(furnSub + renoSub).toBe(grand)
  })

  it('neutralises CSV-injection in finish names + RFC-4180 quotes commas', () => {
    const csv = buildCostBreakdownCsv(
      plan([room('living', 'Living')]),
      [],
      defs,
      { floor: { living: 'evil-floor' }, walls: {} },
      // A finish name beginning with '=' would be a live formula in Excel.
      (id) => (id === 'evil-floor' ? '=cmd|calc, drop' : id),
    )
    expect(csv).toContain("'=cmd|calc") // formula lead neutralised with a quote
    expect(csv).toContain('"') // comma in the name forces RFC-4180 quoting
  })

  it('empty plan / no items → header, zero subtotals, zero grand total', () => {
    const csv = buildCostBreakdownCsv(plan([]), [], {}, undefined, nameOf)
    const rows = parse(csv)
    expect(rows.find((r) => r[0] === 'Furniture subtotal')).toEqual([
      'Furniture subtotal',
      '',
      '',
      '',
      '',
      '0',
    ])
    expect(rows.find((r) => r[0] === 'Renovation subtotal')![5]).toBe('0')
    expect(rows.find((r) => r[0] === 'GRAND TOTAL')![5]).toBe('0')
  })

  it('accepts the imperial unit system (figures are money totals — unchanged)', () => {
    const metric = buildCostBreakdownCsv(
      plan([room('living', 'Living')]),
      [item('sofa-3seat')],
      defs,
      finishes,
      nameOf,
      'metric',
    )
    const imperial = buildCostBreakdownCsv(
      plan([room('living', 'Living')]),
      [item('sofa-3seat')],
      defs,
      finishes,
      nameOf,
      'imperial',
    )
    expect(imperial).toBe(metric)
  })
})
