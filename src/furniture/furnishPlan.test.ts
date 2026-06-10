import { describe, expect, it } from 'vitest'
import { findItemOverlaps } from '../collision/placement'
import type { FloorPlan } from '../floorplan/types'
import { pointInRoom } from '../floorplan/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { furnishPlanItems } from './furnishPlan'
import { LAYOUT_PRESETS } from './layoutPresets'

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!
const scandi = LAYOUT_PRESETS.find((p) => p.id === 'scandi-calm')!

/** A compact 9×9 custom plan with a living/dining, kitchen, master bedroom and
 *  bath — plus a balcony that must stay unfurnished. */
function makePlan(): FloorPlan {
  const ext: FloorPlan['walls'][number]['thickness'] = 'external'
  return {
    id: 'furnish-test-plan',
    name: 'Test Flat',
    ceilingHeight: 2.6,
    extent: [9, 9],
    walls: [
      { id: 'n', start: [0.1, 0.1], end: [8.9, 0.1], thickness: ext },
      { id: 'e', start: [8.9, 0.1], end: [8.9, 8.9], thickness: ext },
      { id: 's', start: [8.9, 8.9], end: [0.1, 8.9], thickness: ext },
      { id: 'w', start: [0.1, 8.9], end: [0.1, 0.1], thickness: ext },
    ],
    openings: [
      { id: 'door', kind: 'door', wallId: 's', offset: 4, width: 0.9, sill: 0, head: 2.1 },
      { id: 'win-l', kind: 'window', wallId: 'w', offset: 2, width: 1.6, sill: 0.9, head: 2.1 },
      { id: 'win-b', kind: 'window', wallId: 'e', offset: 4, width: 1.4, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'living', name: 'Living / Dining', origin: [0.2, 0.2], width: 4.4, depth: 5.6 },
      { id: 'kitchen', name: 'Kitchen', origin: [4.8, 0.2], width: 3.9, depth: 2.6 },
      { id: 'master', name: 'Master Bedroom', origin: [4.8, 3.0], width: 3.9, depth: 4.0 },
      { id: 'bath', name: 'Bathroom', origin: [0.2, 6.0], width: 2.2, depth: 2.7 },
      { id: 'shelter', name: 'Household Shelter', origin: [2.6, 6.0], width: 2.0, depth: 2.7 },
    ],
  }
}

describe('furnishPlanItems', () => {
  it('furnishes a custom plan with kind-appropriate kits, collision-free', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    expect(items.length).toBeGreaterThan(0)
    // No two pieces overlap after arranging + the overlap sweep.
    expect(findItemOverlaps(items, BUILTIN_CATALOG)).toHaveLength(0)
  })

  it('puts a bed in the bedroom, a sofa + dining set in the living/dining', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    const inRoom = (id: string, defId: string) => {
      const room = plan.rooms.find((r) => r.id === id)!
      return items.some(
        (it) => it.defId === defId && pointInRoom(room, it.position[0], it.position[1]),
      )
    }
    expect(inRoom('master', 'bed-queen')).toBe(true)
    expect(inRoom('living', 'sofa-3seat')).toBe(true)
    expect(inRoom('living', 'dining-table-4')).toBe(true)
    expect(inRoom('kitchen', 'refrigerator')).toBe(true)
    expect(inRoom('bath', 'toilet')).toBe(true)
  })

  it('leaves utility rooms (household shelter) unfurnished', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    const shelter = plan.rooms.find((r) => r.id === 'shelter')!
    const inShelter = items.filter((it) => pointInRoom(shelter, it.position[0], it.position[1]))
    expect(inShelter).toHaveLength(0)
  })

  it('keeps every placed piece inside the plan footprint', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    for (const it of items) {
      expect(it.position[0]).toBeGreaterThanOrEqual(0)
      expect(it.position[0]).toBeLessThanOrEqual(plan.extent[0])
      expect(it.position[1]).toBeGreaterThanOrEqual(0)
      expect(it.position[1]).toBeLessThanOrEqual(plan.extent[1])
    }
  })

  it('furnishes study / standalone-dining / powder / balcony rooms appropriately', () => {
    const ext: FloorPlan['walls'][number]['thickness'] = 'external'
    const plan: FloorPlan = {
      id: 'rooms-test',
      name: 'Rooms',
      ceilingHeight: 2.6,
      extent: [12, 8],
      walls: [
        { id: 'n', start: [0.1, 0.1], end: [11.9, 0.1], thickness: ext },
        { id: 'e', start: [11.9, 0.1], end: [11.9, 7.9], thickness: ext },
        { id: 's', start: [11.9, 7.9], end: [0.1, 7.9], thickness: ext },
        { id: 'w', start: [0.1, 7.9], end: [0.1, 0.1], thickness: ext },
      ],
      openings: [],
      rooms: [
        { id: 'study', name: 'Study', origin: [0.2, 0.2], width: 3.2, depth: 3.0 },
        { id: 'dining', name: 'Dining', origin: [3.6, 0.2], width: 4.0, depth: 3.6 },
        { id: 'powder', name: 'Powder Room', origin: [8.0, 0.2], width: 1.8, depth: 2.0 },
        { id: 'balcony', name: 'Balcony', origin: [0.2, 4.0], width: 3.6, depth: 3.6 },
      ],
    }
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    const has = (id: string, defId: string) => {
      const room = plan.rooms.find((r) => r.id === id)!
      return items.some(
        (it) => it.defId === defId && pointInRoom(room, it.position[0], it.position[1]),
      )
    }
    const none = (id: string, defId: string) => !has(id, defId)
    expect(has('study', 'desk')).toBe(true)
    expect(none('study', 'bed-queen')).toBe(true)
    // Standalone dining gets the table but NOT a sofa.
    expect(has('dining', 'dining-table-4')).toBe(true)
    expect(none('dining', 'sofa-3seat')).toBe(true)
    // Powder room: toilet, no shower.
    expect(has('powder', 'toilet')).toBe(true)
    expect(none('powder', 'shower')).toBe(true)
    // Balcony gets outdoor furniture.
    expect(has('balcony', 'outdoor-table')).toBe(true)
    expect(findItemOverlaps(items, BUILTIN_CATALOG)).toHaveLength(0)
  })

  it('applies the preset cosmetic style to seeded furniture', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, scandi, BUILTIN_CATALOG, {})
    const sofa = items.find((it) => it.defId === 'sofa-3seat')
    expect(sofa).toBeDefined()
    // Scandi restyles the sofa to a pale fabric.
    expect(sofa!.props.color).toBe('#d6d4cc')
    expect(sofa!.props.material).toBe('fabric')
  })
})
