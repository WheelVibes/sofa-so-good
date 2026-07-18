import { describe, expect, it, vi } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildReportHtml } from './report'
import {
  designPalette,
  floorAreaByFinish,
  furnitureCostByRoom,
  furnitureItemsByRoom,
  wallAreaByFinish,
} from './reportData'

// Stub itemPrice → a flat $100 per item so totals are predictable.
vi.mock('../furniture/furniturePrices', () => ({ itemPrice: () => 100 }))

// Two non-overlapping rectangular rooms (no polygon/extension).
const plan = {
  name: 'Test Plan',
  rooms: [
    { id: 'a', name: 'Room A', origin: [0, 0], width: 2, depth: 2 },
    { id: 'b', name: 'Room B', origin: [5, 0], width: 2, depth: 2 },
  ],
} as unknown as FloorPlan

const def = {
  id: 'd',
  name: 'Test Sofa',
  category: 'seating',
  defaultFootprint: { w: 1, d: 1, h: 1 },
} as unknown as FurnitureDef
const catalog: Record<string, FurnitureDef> = { d: def }

function item(id: string, x: number, z: number): FurnitureItem {
  return { id, defId: 'd', position: [x, z], rotation: 0, props: {} } as FurnitureItem
}

describe('furnitureCostByRoom', () => {
  it('attributes items to the room containing their centre', () => {
    const rows = furnitureCostByRoom(
      plan,
      [item('1', 1, 1), item('2', 1.5, 0.5), item('3', 6, 1)],
      catalog,
    )
    expect(rows).toEqual([
      { name: 'Room A', count: 2, total: 200 },
      { name: 'Room B', count: 1, total: 100 },
    ])
  })

  it('buckets items outside every room as Unassigned, last', () => {
    const rows = furnitureCostByRoom(plan, [item('1', 1, 1), item('2', 99, 99)], catalog)
    expect(rows).toEqual([
      { name: 'Room A', count: 1, total: 100 },
      { name: 'Unassigned', count: 1, total: 100 },
    ])
  })

  it('omits rooms with no items and skips unknown defs', () => {
    const rows = furnitureCostByRoom(
      plan,
      [
        item('1', 6, 1),
        { id: 'x', defId: 'missing', position: [1, 1], rotation: 0, props: {} } as FurnitureItem,
      ],
      catalog,
    )
    expect(rows).toEqual([{ name: 'Room B', count: 1, total: 100 }])
  })

  it('returns nothing for an empty layout', () => {
    expect(furnitureCostByRoom(plan, [], catalog)).toEqual([])
  })
})

describe('furnitureItemsByRoom', () => {
  it('groups each room’s items by def with quantities + per-room totals', () => {
    const rows = furnitureItemsByRoom(
      plan,
      [item('1', 1, 1), item('2', 1.5, 0.5), item('3', 6, 1)],
      catalog,
    )
    expect(rows).toEqual([
      {
        name: 'Room A',
        count: 2,
        total: 200,
        area: 4, // 2×2 m
        lines: [{ defId: 'd', name: 'Test Sofa', count: 2, each: 100 }],
      },
      {
        name: 'Room B',
        count: 1,
        total: 100,
        area: 4,
        lines: [{ defId: 'd', name: 'Test Sofa', count: 1, each: 100 }],
      },
    ])
  })

  it('per-room totals match furnitureCostByRoom (consistency)', () => {
    const items = [item('1', 1, 1), item('2', 1.5, 0.5), item('3', 6, 1), item('4', 99, 99)]
    const costs = furnitureCostByRoom(plan, items, catalog)
    const breakdown = furnitureItemsByRoom(plan, items, catalog)
    expect(breakdown.map((r) => ({ name: r.name, count: r.count, total: r.total }))).toEqual(costs)
  })

  it('buckets out-of-room items as Unassigned, last', () => {
    const rows = furnitureItemsByRoom(plan, [item('1', 1, 1), item('2', 99, 99)], catalog)
    expect(rows.map((r) => r.name)).toEqual(['Room A', 'Unassigned'])
  })
})

describe('buildReportHtml — furniture by room section', () => {
  it('renders an itemised Furniture by room table with attributed rooms', () => {
    const html = buildReportHtml(plan, [item('1', 1, 1), item('2', 6, 1)], catalog, null)
    expect(html).toContain('Furniture by room')
    expect(html).toContain('Room A · 1 item')
    expect(html).toContain('Room B · 1 item')
    // Itemised: each room lists its pieces by name.
    expect(html).toContain('Test Sofa')
  })

  it('omits the section entirely when no furniture is placed', () => {
    const html = buildReportHtml(plan, [], catalog, null)
    expect(html).not.toContain('Furniture by room')
  })
})

describe('buildReportHtml — furnished plan', () => {
  it('renders furniture footprints + a category legend on the plan', () => {
    // A real walled plan so reportPlanSvg emits a diagram; seating item inside it.
    const html = buildReportHtml(buildDefaultPlan(), [item('1', 1.5, 1.5)], catalog, null)
    expect(html).toContain('<polygon') // furniture footprint
    expect(html).toContain('plan-legend')
    expect(html).toContain('Seating') // legend entry for the item's category
  })
})

describe('designPalette', () => {
  it('returns [] for no finishes', () => {
    expect(designPalette(undefined)).toEqual([])
    expect(designPalette({ floor: {}, walls: {} })).toEqual([])
  })

  it('dedupes across rooms and orders by usage count', () => {
    const pal = designPalette({
      floor: { a: 'wall-paint-white', b: 'wall-paint-white' },
      walls: { a: '#abcdef' },
    })
    expect(pal).toHaveLength(2)
    // wall-paint-white used twice → first; custom hex once → second.
    expect(pal[0]).toMatchObject({ id: 'wall-paint-white', name: 'White paint', count: 2 })
    expect(pal[0].swatch).toBe('#f5f5f0')
    expect(pal[1]).toMatchObject({ id: '#abcdef', name: '#ABCDEF', swatch: '#abcdef', count: 1 })
  })

  it('lists an unknown (DLC/remote) id with a neutral chip', () => {
    const pal = designPalette({ floor: { a: 'mat:some-cc0' }, walls: {} })
    expect(pal[0]).toMatchObject({ id: 'mat:some-cc0', name: 'mat:some-cc0', swatch: '#cccccc' })
  })

  it('finishes-by-room follows the active plan rooms (custom plans)', () => {
    // Custom-plan room ids ('a'/'b') are not in the default ROOMS constant; the
    // report must still list them with their finishes.
    const html = buildReportHtml(plan, [], catalog, null, 'metric', {
      floor: { a: 'wall-paint-white' },
      walls: { b: '#abcdef' },
    })
    expect(html).toContain('Finishes schedule')
    expect(html).toContain('Room A')
    expect(html).toContain('Room B')
    expect(html).toContain('White paint')
  })

  it('is surfaced in the report HTML as a Material palette', () => {
    const html = buildReportHtml(plan, [], catalog, null, 'metric', {
      floor: { a: 'wall-paint-white' },
      walls: { a: '#abcdef' },
    })
    expect(html).toContain('Material palette')
    expect(html).toContain('#abcdef')
  })
})

describe('floorAreaByFinish', () => {
  it('sums floor area per finish across rooms, sorted by area desc', () => {
    // Room A 2×2 = 4 m², Room B 2×2 = 4 m²; A→oak, B→oak → oak 8 m².
    const out = floorAreaByFinish(plan, { a: 'oak', b: 'oak' })
    expect(out).toEqual([{ id: 'oak', area: 8 }])
  })

  it('groups distinct finishes and orders by area', () => {
    const big = {
      rooms: [
        { id: 'a', name: 'A', origin: [0, 0], width: 2, depth: 2 }, // 4
        { id: 'b', name: 'B', origin: [5, 0], width: 3, depth: 3 }, // 9
      ],
    } as unknown as FloorPlan
    const out = floorAreaByFinish(big, { a: 'oak', b: 'tile' })
    expect(out).toEqual([
      { id: 'tile', area: 9 },
      { id: 'oak', area: 4 },
    ])
  })

  it('skips rooms with no finish set and tolerates undefined', () => {
    expect(floorAreaByFinish(plan, { a: 'oak' })).toEqual([{ id: 'oak', area: 4 }])
    expect(floorAreaByFinish(plan, undefined)).toEqual([])
  })
})

describe('wallAreaByFinish', () => {
  it('sums perimeter × ceiling height per wall finish', () => {
    // Each 2×2 room: perimeter 2·(2+2)=8 m × height 2.5 = 20 m². Both → 'paint' → 40.
    const out = wallAreaByFinish(plan, { a: 'paint', b: 'paint' }, 2.5)
    expect(out).toEqual([{ id: 'paint', area: 40 }])
  })

  it('uses a room-level ceiling override when present', () => {
    const p = {
      rooms: [{ id: 'a', name: 'A', origin: [0, 0], width: 2, depth: 2, ceilingHeight: 3 }],
    } as unknown as FloorPlan
    // perimeter 8 × 3 = 24 (override beats the 2.5 default).
    expect(wallAreaByFinish(p, { a: 'tile' }, 2.5)).toEqual([{ id: 'tile', area: 24 }])
  })

  it('returns nothing when walls are undefined', () => {
    expect(wallAreaByFinish(plan, undefined, 2.5)).toEqual([])
  })
})
