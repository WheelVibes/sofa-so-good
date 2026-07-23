import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { pointInRoom } from '../floorplan/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { furnishOcsItems } from './furnishPlan'
import {
  buildOcsFloorFinishesForDefault,
  buildOcsFloorFinishesForPlan,
  OCS_BATH_KIT,
  OCS_FITTING_DEF_IDS,
  OCS_PORCELAIN,
  OCS_VINYL,
  ocsFloorForCategory,
} from './ocsStarter'

describe('ocsFloorForCategory', () => {
  it('gives vinyl to bedrooms/study and porcelain to living/dining/foyer', () => {
    expect(ocsFloorForCategory('bedroom')).toBe(OCS_VINYL)
    expect(ocsFloorForCategory('masterBedroom')).toBe(OCS_VINYL)
    expect(ocsFloorForCategory('study')).toBe(OCS_VINYL)
    expect(ocsFloorForCategory('living')).toBe(OCS_PORCELAIN)
    expect(ocsFloorForCategory('dining')).toBe(OCS_PORCELAIN)
    expect(ocsFloorForCategory('foyer')).toBe(OCS_PORCELAIN)
  })

  it('leaves kitchen / bath / utility floors untouched (always HDB-tiled)', () => {
    expect(ocsFloorForCategory('kitchen')).toBeUndefined()
    expect(ocsFloorForCategory('bath')).toBeUndefined()
    expect(ocsFloorForCategory('serviceYard')).toBeUndefined()
    expect(ocsFloorForCategory('balcony')).toBeUndefined()
  })
})

describe('OCS fitting manifest', () => {
  it('includes the wall-mounted basin, shower set and WC', () => {
    expect(OCS_FITTING_DEF_IDS).toContain('bathroom-sink')
    expect(OCS_FITTING_DEF_IDS).toContain('shower')
    expect(OCS_FITTING_DEF_IDS).toContain('toilet')
  })

  it('resolves every fitting def against the builtin catalog', () => {
    for (const p of OCS_BATH_KIT) {
      expect(BUILTIN_CATALOG[p.defId]).toBeDefined()
    }
  })
})

describe('buildOcsFloorFinishesForDefault', () => {
  it('sets vinyl across the bedrooms + living/dining + corridor (SNV OCS sheet)', () => {
    const f = buildOcsFloorFinishesForDefault()
    expect(f.mainBedroom).toBe(OCS_VINYL)
    expect(f.bedroom2).toBe(OCS_VINYL)
    expect(f.bedroom3).toBe(OCS_VINYL)
    expect(f.livingDining).toBe(OCS_VINYL)
    expect(f.corridor).toBe(OCS_VINYL)
    // Wet / utility rooms are not re-finished.
    expect(f.kitchen).toBeUndefined()
    expect(f.bath1).toBeUndefined()
  })
})

function makePlan(): FloorPlan {
  const ext: FloorPlan['walls'][number]['thickness'] = 'external'
  return {
    id: 'ocs-test-plan',
    name: 'OCS Test',
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
    ],
    rooms: [
      {
        id: 'living',
        name: 'Living / Dining',
        origin: [0.2, 0.2],
        width: 4.4,
        depth: 5.6,
        category: 'living',
      },
      {
        id: 'bed',
        name: 'Bedroom 1',
        origin: [4.8, 3.0],
        width: 3.9,
        depth: 4.0,
        category: 'bedroom',
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        origin: [4.8, 0.2],
        width: 3.9,
        depth: 2.6,
        category: 'kitchen',
      },
      {
        id: 'bath',
        name: 'Bathroom',
        origin: [0.2, 6.0],
        width: 2.4,
        depth: 2.7,
        category: 'bath',
      },
    ],
  }
}

describe('buildOcsFloorFinishesForPlan', () => {
  it('maps each room to its OCS floor by category, omitting untouched rooms', () => {
    const f = buildOcsFloorFinishesForPlan(makePlan())
    expect(f.living).toBe(OCS_PORCELAIN)
    expect(f.bed).toBe(OCS_VINYL)
    expect(f.kitchen).toBeUndefined()
    expect(f.bath).toBeUndefined()
  })
})

describe('furnishOcsItems', () => {
  it('places OCS sanitary fittings in the bathroom only (bare handover, no living-room furniture)', () => {
    const plan = makePlan()
    const items = furnishOcsItems(plan, [...OCS_BATH_KIT], BUILTIN_CATALOG, {})
    expect(items.length).toBeGreaterThan(0)
    // Every placed item is one of the OCS fittings.
    for (const it of items) {
      expect(OCS_FITTING_DEF_IDS).toContain(it.defId)
    }
    // At least the WC + basin land inside the bathroom.
    const bath = plan.rooms.find((r) => r.id === 'bath')!
    const inBath = (defId: string) =>
      items.some((it) => it.defId === defId && pointInRoom(bath, it.position[0], it.position[1]))
    expect(inBath('toilet')).toBe(true)
    expect(inBath('bathroom-sink')).toBe(true)
    // Nothing placed in the living room.
    const living = plan.rooms.find((r) => r.id === 'living')!
    expect(items.some((it) => pointInRoom(living, it.position[0], it.position[1]))).toBe(false)
  })
})
