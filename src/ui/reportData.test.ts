import { describe, expect, it, vi } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildReportHtml } from './report'
import { designPalette, furnitureCostByRoom } from './reportData'

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

const def = { id: 'd', name: 'Test Sofa', category: 'seating' } as unknown as FurnitureDef
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

describe('buildReportHtml — cost by room section', () => {
  it('renders a Cost by room table with attributed rooms', () => {
    const html = buildReportHtml(plan, [item('1', 1, 1), item('2', 6, 1)], catalog, null)
    expect(html).toContain('Cost by room')
    expect(html).toContain('Room A')
    expect(html).toContain('Room B')
  })

  it('omits the section entirely when no furniture is placed', () => {
    const html = buildReportHtml(plan, [], catalog, null)
    expect(html).not.toContain('Cost by room')
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

  it('is surfaced in the report HTML as a Material palette', () => {
    const html = buildReportHtml(plan, [], catalog, null, 'metric', {
      floor: { a: 'wall-paint-white' },
      walls: { a: '#abcdef' },
    })
    expect(html).toContain('Material palette')
    expect(html).toContain('#abcdef')
  })
})
