import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, RoomCategory } from '../floorplan/types'
import {
  buildAirconSystemPlan,
  CONDENSER_NOMINAL_BTU,
  LEDGE_MAX_KG,
  MAX_CONNECTION_RATIO,
  MAX_FCU_PER_CONDENSER,
} from './airconSystem'

/** A rectangular room of `w × d` m with an explicit category. Walls are omitted
 *  (the system planner only needs areas + categories; orientation uplift is off
 *  without external walls, which is fine for grouping maths). */
function room(id: string, name: string, w: number, d: number, category: RoomCategory): PlanRoom {
  return { id, name, origin: [0, 0], width: w, depth: d, category }
}

function plan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'test',
    name: 'Test',
    ceilingHeight: 2.8,
    extent: [40, 40],
    walls: [],
    openings: [],
    rooms,
  }
}

describe('buildAirconSystemPlan — grouping', () => {
  it('splits a 4-room flat into common (living) + private (bedrooms) condensers', () => {
    // Living/Dining (20 m² → 12000) + 3 bedrooms (9 m² → 9000 each).
    const p = plan([
      room('ld', 'Living / Dining', 5, 4, 'living'),
      room('m', 'Master', 3, 3, 'masterBedroom'),
      room('b2', 'Bedroom 2', 3, 3, 'bedroom'),
      room('b3', 'Bedroom 3', 3, 3, 'bedroom'),
      // Non-habitable rooms are ignored.
      room('k', 'Kitchen', 3, 2, 'kitchen'),
      room('bath', 'Bath', 2, 2, 'bath'),
    ])
    const plan_ = buildAirconSystemPlan(p)
    expect(plan_.fcuCount).toBe(4)
    expect(plan_.condenserCount).toBe(2)
    expect(plan_.needsMultipleCondensers).toBe(true)
    // Common condenser first (the single living/dining FCU), then the 3-bedroom System-3.
    const [common, priv] = plan_.systems
    expect(common.fcus.map((f) => f.roomId)).toEqual(['ld'])
    expect(common.label).toBe('Single split')
    expect(priv.fcus).toHaveLength(3)
    expect(priv.label).toBe('System-3')
    expect(priv.fcus.every((f) => f.zone === 'private')).toBe(true)
  })

  it('groups two common rooms onto a System-2 and keeps bedrooms separate', () => {
    const p = plan([
      room('lv', 'Living', 4, 4, 'living'),
      room('dn', 'Dining', 3, 3, 'dining'),
      room('m', 'Master', 3, 3, 'masterBedroom'),
      room('b2', 'Bedroom 2', 3, 3, 'bedroom'),
    ])
    const plan_ = buildAirconSystemPlan(p)
    expect(plan_.condenserCount).toBe(2)
    const [common, priv] = plan_.systems
    expect(common.label).toBe('System-2')
    expect(common.fcus.map((f) => f.roomId).sort()).toEqual(['dn', 'lv'])
    expect(priv.label).toBe('System-2')
  })

  it('flags a system that exceeds the ~130% connection-ratio cap', () => {
    // 3 big bedrooms (36 m² → 21600 → 24000 FCU each = 72000) on a System-3
    // nominal 30000 → ratio 2.4, over the cap.
    const p = plan([
      room('m', 'Master', 6, 6, 'masterBedroom'),
      room('b2', 'Bedroom 2', 6, 6, 'bedroom'),
      room('b3', 'Bedroom 3', 6, 6, 'bedroom'),
    ])
    const sys = buildAirconSystemPlan(p).systems[0]!
    expect(sys.label).toBe('System-3')
    expect(sys.condenserNominalBtu).toBe(CONDENSER_NOMINAL_BTU[3])
    expect(sys.loadRatio).toBeGreaterThan(MAX_CONNECTION_RATIO)
    expect(sys.overCapacity).toBe(true)
  })

  it('keeps a well-sized system under the cap', () => {
    // 3 small bedrooms (9 m² → 9000 each = 27000) on System-3 nominal 30000 → 0.9.
    const p = plan([
      room('m', 'Master', 3, 3, 'masterBedroom'),
      room('b2', 'Bedroom 2', 3, 3, 'bedroom'),
      room('b3', 'Bedroom 3', 3, 3, 'bedroom'),
    ])
    const sys = buildAirconSystemPlan(p).systems[0]!
    expect(sys.overCapacity).toBe(false)
    expect(sys.loadRatio).toBeLessThanOrEqual(MAX_CONNECTION_RATIO)
  })

  it('splits a zone larger than MAX_FCU_PER_CONDENSER onto multiple condensers', () => {
    // 5 bedrooms → ceil(5/4)=2 condensers, split evenly 3 + 2.
    const beds = Array.from({ length: 5 }, (_, i) =>
      room(`b${i}`, `Bedroom ${i}`, 3, 3, i === 0 ? 'masterBedroom' : 'bedroom'),
    )
    const plan_ = buildAirconSystemPlan(plan(beds))
    expect(plan_.condenserCount).toBe(2)
    expect(plan_.systems.map((s) => s.fcus.length).sort()).toEqual([2, 3])
    expect(plan_.systems.map((s) => s.label).sort()).toEqual(['System-2', 'System-3'])
    expect(plan_.fcuCount).toBe(5)
    expect(MAX_FCU_PER_CONDENSER).toBe(4)
  })

  it('emits a within-guideline ledge note for two light condensers', () => {
    const p = plan([
      room('ld', 'Living / Dining', 5, 4, 'living'),
      room('m', 'Master', 3, 3, 'masterBedroom'),
      room('b2', 'Bedroom 2', 3, 3, 'bedroom'),
      room('b3', 'Bedroom 3', 3, 3, 'bedroom'),
    ])
    const plan_ = buildAirconSystemPlan(p)
    expect(plan_.ledgeWeightNote).toBeTruthy()
    expect(plan_.ledgeWeightNote).toContain('within')
    expect(plan_.totalCondenserWeightKg).toBeLessThanOrEqual(LEDGE_MAX_KG)
  })

  it('warns when many condensers likely exceed the ledge weight guideline', () => {
    // 8 bedrooms → 4 + 4 → two System-4 condensers (~60 kg each = 120 kg > 110).
    const beds = Array.from({ length: 8 }, (_, i) =>
      room(`b${i}`, `Bedroom ${i}`, 3, 3, i === 0 ? 'masterBedroom' : 'bedroom'),
    )
    const plan_ = buildAirconSystemPlan(plan(beds))
    expect(plan_.condenserCount).toBe(2)
    expect(plan_.totalCondenserWeightKg).toBeGreaterThan(LEDGE_MAX_KG)
    expect(plan_.ledgeWeightNote).toContain('EXCEEDS')
  })

  it('returns an empty proposal with no ledge note for a plan with no habitable rooms', () => {
    const plan_ = buildAirconSystemPlan(plan([room('k', 'Kitchen', 3, 2, 'kitchen')]))
    expect(plan_.systems).toHaveLength(0)
    expect(plan_.condenserCount).toBe(0)
    expect(plan_.needsMultipleCondensers).toBe(false)
    expect(plan_.ledgeWeightNote).toBeNull()
  })
})
