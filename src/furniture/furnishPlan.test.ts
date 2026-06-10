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
      { id: 'balcony', name: 'Balcony', origin: [2.6, 6.0], width: 2.0, depth: 2.7 },
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

  it('leaves utility / balcony rooms unfurnished', () => {
    const plan = makePlan()
    const items = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {})
    const balcony = plan.rooms.find((r) => r.id === 'balcony')!
    const inBalcony = items.filter((it) => pointInRoom(balcony, it.position[0], it.position[1]))
    expect(inBalcony).toHaveLength(0)
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
