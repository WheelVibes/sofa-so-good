/**
 * Whole-home coverage for the COST / PROCUREMENT layer (F13).
 *
 * These builders are all whole-plan (report, BOQ, cost CSV, FF&E schedule,
 * shopping list — verified at every call site), and every one of them
 * enumerated `plan.rooms`, which is GROUND-ONLY. A maisonette's flooring order
 * was therefore short by the entire upstairs, and every upstairs piece of
 * furniture was filed as "Unassigned".
 *
 * Each test is verified to FAIL without its fix.
 */
import { describe, expect, it } from 'vitest'
import { buildFfeSchedule } from '../ffe/ffeSchedule'
import { roomAtItem } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { floorAreaByFinish, furnitureCostByRoom, wallAreaByFinish } from './reportData'
import { buildShopList } from './shoplist'

/**
 * Ground: a 6x5 living room on oak. Upper: a 4x3 bedroom on the SAME oak (so a
 * ground-only read reports a smaller area for one finish rather than losing a
 * finish entirely — the harder failure to notice) plus a 2x2 bath on tile.
 * The upper storey has a DIFFERENT ceiling height, which the wall-area
 * fallback has to respect.
 */
function twoStorey(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'g-living', name: 'Living', origin: [0, 0], width: 6, depth: 5, floor: 'oak' }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        ceilingHeight: 3.2,
        walls: [],
        openings: [],
        rooms: [
          { id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 4, depth: 3, floor: 'oak' },
          { id: 'u-bath', name: 'Bath', origin: [4, 0], width: 2, depth: 2, floor: 'tile' },
        ],
      },
    ],
  } as unknown as FloorPlan
}

const FLOORS = { 'g-living': 'oak', 'u-bed': 'oak', 'u-bath': 'tile' }
const WALLS = { 'g-living': 'paint', 'u-bed': 'paint', 'u-bath': 'tile' }

function def(id: string): FurnitureDef {
  return {
    id,
    name: id,
    category: 'seating',
    kind: 'primitive',
    defaultFootprint: { w: 1, d: 1, h: 1 },
    price: 500,
  } as unknown as FurnitureDef
}

/** An item at (1,1) — inside the ground living room AND inside the upper bedroom. */
function itemAt(id: string, levelId?: string): FurnitureItem {
  return {
    id,
    defId: 'chair',
    position: [1, 1],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  } as unknown as FurnitureItem
}

const DEFS = { chair: def('chair') }

describe('roomAtItem is gated to the item OWN storey', () => {
  it('resolves an upstairs item to the upstairs room, not the one beneath it', () => {
    // The two rooms overlap in XZ — a flat `allPlanRooms` search would have
    // returned whichever came first, silently costing a bed into the living room.
    expect(roomAtItem(twoStorey(), itemAt('a', 'upper'))?.id).toBe('u-bed')
    expect(roomAtItem(twoStorey(), itemAt('b'))?.id).toBe('g-living')
  })

  it('returns null for an item outside every room on its own storey', () => {
    const outside = { ...itemAt('c', 'upper'), position: [20, 20] } as unknown as FurnitureItem
    expect(roomAtItem(twoStorey(), outside)).toBeNull()
  })
})

describe('finish-area schedules cover every storey', () => {
  it('counts the upstairs floor area', () => {
    const areas = floorAreaByFinish(twoStorey(), FLOORS)
    const oak = areas.find((a) => a.id === 'oak')!
    // 30 downstairs + 12 up. A ground-only read said 30 — a plausible number,
    // which is why this went unnoticed.
    expect(oak.area).toBeCloseTo(42, 6)
    expect(areas.find((a) => a.id === 'tile')!.area).toBeCloseTo(4, 6)
  })

  it('measures each storey wall area against ITS OWN ceiling height', () => {
    const areas = wallAreaByFinish(twoStorey(), WALLS, 2.6)
    // Living perimeter 22 x 2.6 = 57.2; bedroom perimeter 14 x the UPPER
    // storey's 3.2 = 44.8. Using the ground 2.6 would give 36.4.
    expect(areas.find((a) => a.id === 'paint')!.area).toBeCloseTo(57.2 + 44.8, 6)
    expect(areas.find((a) => a.id === 'tile')!.area).toBeCloseTo(8 * 3.2, 6)
  })
})

describe('per-room furniture breakdowns cover every storey', () => {
  it('files an upstairs item in its upstairs room, not Unassigned', () => {
    const rows = furnitureCostByRoom(twoStorey(), [itemAt('a', 'upper')], DEFS)
    expect(rows.map((r) => r.name)).toEqual(['Bedroom'])
  })

  it('keeps two overlapping storeys separate rather than merging them', () => {
    const rows = furnitureCostByRoom(twoStorey(), [itemAt('a', 'upper'), itemAt('b')], DEFS)
    expect(rows.map((r) => r.name).sort()).toEqual(['Bedroom', 'Living'])
    expect(rows.every((r) => r.count === 1)).toBe(true)
  })

  it('gives the FF&E schedule the upstairs room name', () => {
    const rows = buildFfeSchedule(twoStorey(), [itemAt('a', 'upper')], DEFS)
    expect(rows.map((r) => r.room)).toEqual(['Bedroom'])
  })

  it('gives the shopping list the upstairs room name', () => {
    const list = buildShopList(twoStorey(), [itemAt('a', 'upper')], DEFS)
    const rooms = list.groups.flatMap((g) => g.lines.map((l) => l.room))
    expect(rooms).toEqual(['Bedroom'])
  })
})
