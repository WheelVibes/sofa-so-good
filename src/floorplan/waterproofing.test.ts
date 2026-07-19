import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, RoomCategory } from './types'
import {
  buildWaterproofingZones,
  GENERAL_UPTURN_MM,
  SHOWER_UPTURN_MM,
  totalMembraneAreaM2,
  upturnLabel,
} from './waterproofing'

function room(id: string, category: RoomCategory, w: number, d: number, x = 0, z = 0): PlanRoom {
  return { id, name: id, category, origin: [x, z], width: w, depth: d }
}

function plan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    ceilingHeight: 2.8,
    extent: [20, 20],
    walls: [],
    openings: [],
    rooms,
  }
}

describe('buildWaterproofingZones', () => {
  it('emits a zone only for wet / hard-service rooms, never dry rooms', () => {
    const zones = buildWaterproofingZones(
      plan([
        room('bath', 'bath', 2, 2),
        room('kitchen', 'kitchen', 3, 2, 5, 0),
        room('bedroom', 'bedroom', 3, 3, 10, 0),
        room('living', 'living', 4, 4, 0, 5),
      ]),
    )
    expect(zones.map((z) => z.roomId).sort()).toEqual(['bath', 'kitchen'])
  })

  it('includes balcony + service yard as wet zones', () => {
    const zones = buildWaterproofingZones(
      plan([room('bal', 'balcony', 2, 2), room('yard', 'serviceYard', 2, 2, 5, 0)]),
    )
    expect(zones.map((z) => z.roomId).sort()).toEqual(['bal', 'yard'])
  })

  it('bath with NO placed shower uses a conservative full-perimeter 1800 mm upturn', () => {
    // 2×2 bath: area 4, perimeter 8.
    const [z] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]))
    expect(z.showerDetected).toBe(false)
    expect(z.generalUpturnMm).toBe(GENERAL_UPTURN_MM)
    expect(z.showerUpturnMm).toBe(SHOWER_UPTURN_MM)
    expect(z.showerWallRunM).toBeCloseTo(8) // full perimeter
    // floor 4 + perimeter×0.3 (2.4) + perimeter×(1.8−0.3) (12) = 18.4
    expect(z.membraneAreaM2).toBeCloseTo(18.4)
  })

  it('bath WITH a placed shower localizes the 1800 mm run', () => {
    const [z] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]), [
      { defId: 'shower', position: [1, 1] }, // centre of the 2×2 bath
    ])
    expect(z.showerDetected).toBe(true)
    expect(z.showerWallRunM).toBeCloseTo(2.4) // one enclosure run, not full perimeter
    // floor 4 + perimeter×0.3 (2.4) + 2.4×1.5 (3.6) = 10.0
    expect(z.membraneAreaM2).toBeCloseTo(10)
  })

  it('ignores a shower item whose centre is outside the room', () => {
    const [z] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]), [
      { defId: 'shower', position: [99, 99] },
    ])
    expect(z.showerDetected).toBe(false)
  })

  it('recognises a shower-screen as a shower', () => {
    const [z] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]), [
      { defId: 'shower-screen', position: [1, 1] },
    ])
    expect(z.showerDetected).toBe(true)
  })

  it('kitchen gets a 300 mm general upturn only (no shower height)', () => {
    // 3×2 kitchen: area 6, perimeter 10.
    const [z] = buildWaterproofingZones(plan([room('kitchen', 'kitchen', 3, 2)]))
    expect(z.showerUpturnMm).toBeUndefined()
    expect(z.showerWallRunM).toBe(0)
    // floor 6 + perimeter×0.3 (3) = 9
    expect(z.membraneAreaM2).toBeCloseTo(9)
  })

  it('totalMembraneAreaM2 sums every zone', () => {
    const zones = buildWaterproofingZones(
      plan([room('bath', 'bath', 2, 2), room('kitchen', 'kitchen', 3, 2, 5, 0)]),
    )
    expect(totalMembraneAreaM2(zones)).toBeCloseTo(18.4 + 9)
  })

  it('upturnLabel reflects shower detection', () => {
    const [bathNoShower] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]))
    expect(upturnLabel(bathNoShower)).toContain('full perimeter')
    const [bathShower] = buildWaterproofingZones(plan([room('bath', 'bath', 2, 2)]), [
      { defId: 'shower', position: [1, 1] },
    ])
    expect(upturnLabel(bathShower)).toContain('shower walls')
    const [kitchen] = buildWaterproofingZones(plan([room('kitchen', 'kitchen', 3, 2)]))
    expect(upturnLabel(kitchen)).toBe('300 mm')
  })
})
