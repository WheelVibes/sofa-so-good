import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan } from '../floorplan/types'
import {
  absentLeafDoorIds,
  bareSanitaryProvisions,
  INTAKE_STATES,
  isStripoutKeep,
  retainsWetFloor,
  SCREED,
  screedDryFloorFinishes,
} from './intakeStates'

describe('retainsWetFloor', () => {
  it('keeps wet + kitchen + service-yard floors, screeds dry rooms', () => {
    expect(retainsWetFloor('bath')).toBe(true)
    expect(retainsWetFloor('powder')).toBe(true)
    expect(retainsWetFloor('kitchen')).toBe(true)
    expect(retainsWetFloor('serviceYard')).toBe(true)
    expect(retainsWetFloor('bedroom')).toBe(false)
    expect(retainsWetFloor('masterBedroom')).toBe(false)
    expect(retainsWetFloor('living')).toBe(false)
    expect(retainsWetFloor('study')).toBe(false)
  })
})

describe('screedDryFloorFinishes (default flat)', () => {
  const plan = buildDefaultPlan()
  const f = screedDryFloorFinishes(plan)

  it('screeds the dry rooms', () => {
    expect(f.mainBedroom).toBe(SCREED)
    expect(f.bedroom2).toBe(SCREED)
    expect(f.bedroom3).toBe(SCREED)
    expect(f.livingDining).toBe(SCREED)
    expect(f.corridor).toBe(SCREED)
  })

  it('retains wet + kitchen + service-yard floors (omitted from the map)', () => {
    expect(f.kitchen).toBeUndefined()
    expect(f.bath1).toBeUndefined()
    expect(f.bath2).toBeUndefined()
    expect(f.serviceYard).toBeUndefined()
  })

  it('only ever assigns the screed material', () => {
    for (const v of Object.values(f)) expect(v).toBe(SCREED)
  })
})

describe('absentLeafDoorIds (default flat)', () => {
  const plan = buildDefaultPlan()
  const ids = absentLeafDoorIds(plan)

  it('removes bedroom / bathroom / utility internal door leaves', () => {
    expect(ids).toContain('door-mainBedroom')
    expect(ids).toContain('door-bedroom2')
    expect(ids).toContain('door-bedroom3')
    expect(ids).toContain('door-bath1')
    expect(ids).toContain('door-bath2')
    expect(ids).toContain('door-serviceYard')
  })

  it('keeps the main entrance + the household-shelter blast door', () => {
    expect(ids).not.toContain('door-main')
    expect(ids).not.toContain('door-householdShelter')
  })

  it('never lists a window opening', () => {
    for (const id of ids) expect(id.startsWith('door-')).toBe(true)
  })
})

describe('bareSanitaryProvisions (default flat)', () => {
  const plan = buildDefaultPlan()
  const pts = bareSanitaryProvisions(plan)

  it('seeds a WC soil pipe + a basin water point per bathroom', () => {
    const bathCount = plan.rooms.filter((r) => {
      const c = roomCategory(r)
      return c === 'bath' || c === 'powder'
    }).length
    expect(bathCount).toBeGreaterThan(0)
    expect(pts.filter((p) => p.kind === 'soil-pipe')).toHaveLength(bathCount)
    expect(pts.filter((p) => p.kind === 'water-point')).toHaveLength(bathCount)
    expect(pts).toHaveLength(bathCount * 2)
  })

  it('labels each provision honestly', () => {
    expect(pts.some((p) => p.label === 'WC (provision)')).toBe(true)
    expect(pts.some((p) => p.label === 'Basin (provision)')).toBe(true)
  })

  it('returns [] for a plan with no bathrooms', () => {
    const noBath: FloorPlan = {
      ...plan,
      rooms: plan.rooms.filter((r) => {
        const c = roomCategory(r)
        return c !== 'bath' && c !== 'powder'
      }),
    }
    expect(bareSanitaryProvisions(noBath)).toEqual([])
  })
})

describe('isStripoutKeep', () => {
  it('keeps wet-area + kitchen fittings', () => {
    expect(isStripoutKeep('toilet')).toBe(true)
    expect(isStripoutKeep('bathroom-sink')).toBe(true)
    expect(isStripoutKeep('shower')).toBe(true)
    expect(isStripoutKeep('water-heater')).toBe(true)
    expect(isStripoutKeep('hob')).toBe(true)
    expect(isStripoutKeep('range-hood')).toBe(true)
  })

  it('strips furniture + wardrobes + carpentry', () => {
    expect(isStripoutKeep('sofa-3seat')).toBe(false)
    expect(isStripoutKeep('wardrobe-3door')).toBe(false)
    expect(isStripoutKeep('bed-queen')).toBe(false)
    expect(isStripoutKeep('kitchen-cabinets')).toBe(false)
  })
})

describe('INTAKE_STATES metadata', () => {
  it('offers the four buyer starting states with a name + blurb each', () => {
    expect(INTAKE_STATES.map((s) => s.id)).toEqual([
      'bto-bare',
      'bto-ocs',
      'resale-asis',
      'resale-stripout',
    ])
    for (const s of INTAKE_STATES) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.blurb.length).toBeGreaterThan(0)
    }
  })
})
