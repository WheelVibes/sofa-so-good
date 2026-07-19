import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, PlanWall, RoomCategory } from '../floorplan/types'
import { findLedgeRoom, planAirconPlacements } from './airconPlacement'
import { buildAirconSystemPlan } from './airconSystem'

function rectRoom(
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  category: RoomCategory,
): PlanRoom {
  return { id, name, origin: [x, z], width: w, depth: d, category }
}

/** Four edge walls of a rectangle [x,z]..[x+w,z+d]; the north wall external so
 *  the FCU wall-pick prefers it (aircon pipes exit an external wall). */
function rectWalls(prefix: string, x: number, z: number, w: number, d: number): PlanWall[] {
  return [
    { id: `${prefix}-n`, start: [x, z], end: [x + w, z], thickness: 'external' },
    { id: `${prefix}-s`, start: [x, z + d], end: [x + w, z + d], thickness: 'internal' },
    { id: `${prefix}-w`, start: [x, z], end: [x, z + d], thickness: 'internal' },
    { id: `${prefix}-e`, start: [x + w, z], end: [x + w, z + d], thickness: 'internal' },
  ]
}

function plan(rooms: PlanRoom[], walls: PlanWall[]): FloorPlan {
  return {
    id: 'test',
    name: 'Test',
    ceilingHeight: 2.8,
    extent: [40, 40],
    walls,
    openings: [],
    rooms,
  }
}

describe('planAirconPlacements', () => {
  it('places an FCU in each served room + condensers on the AC ledge', () => {
    const rooms = [
      rectRoom('ld', 'Living / Dining', 0, 0, 5, 4, 'living'),
      rectRoom('m', 'Master', 6, 0, 3, 3, 'masterBedroom'),
      rectRoom('ledge', 'AC Ledge', 10, 0, 2, 1.2, 'other'),
    ]
    const walls = [
      ...rectWalls('ld', 0, 0, 5, 4),
      ...rectWalls('m', 6, 0, 3, 3),
      ...rectWalls('ledge', 10, 0, 2, 1.2),
    ]
    const p = plan(rooms, walls)
    const systemPlan = buildAirconSystemPlan(p)
    const items = planAirconPlacements(p, systemPlan)

    const fcus = items.filter((i) => i.defId === 'aircon-unit')
    const condensers = items.filter((i) => i.defId === 'aircon-condenser')
    // One FCU per served (habitable) room — living + master, not the ledge.
    expect(fcus).toHaveLength(2)
    expect(fcus.map((f) => f.roomId).sort()).toEqual(['ld', 'm'])
    // Condenser count matches the system plan; all sit on the ledge room.
    expect(condensers).toHaveLength(systemPlan.condenserCount)
    expect(condensers.every((c) => c.roomId === 'ledge')).toBe(true)

    // Each FCU lands inside its room's bounds and carries sane props.
    for (const fcu of fcus) {
      const r = rooms.find((rr) => rr.id === fcu.roomId)!
      expect(fcu.position[0]).toBeGreaterThanOrEqual(r.origin[0] - 0.01)
      expect(fcu.position[0]).toBeLessThanOrEqual(r.origin[0] + r.width + 0.01)
      expect(fcu.position[1]).toBeGreaterThanOrEqual(r.origin[1] - 0.01)
      expect(fcu.position[1]).toBeLessThanOrEqual(r.origin[1] + r.depth + 0.01)
      expect(Number.isFinite(fcu.rotation)).toBe(true)
      expect(fcu.props.mountHeight).toBe(2.25)
      expect(fcu.props.width).toBeGreaterThanOrEqual(0.7)
      expect(fcu.props.width).toBeLessThanOrEqual(1.1)
    }

    // Condensers sit inside the ledge room.
    for (const c of condensers) {
      expect(c.position[0]).toBeGreaterThanOrEqual(9.5)
      expect(c.position[0]).toBeLessThanOrEqual(12.5)
    }
  })

  it('places condensers even when there is no ledge (falls back to service yard)', () => {
    const rooms = [
      rectRoom('m', 'Master', 0, 0, 3, 3, 'masterBedroom'),
      rectRoom('yard', 'Service Yard', 4, 0, 2, 1.5, 'serviceYard'),
    ]
    const walls = [...rectWalls('m', 0, 0, 3, 3), ...rectWalls('yard', 4, 0, 2, 1.5)]
    const p = plan(rooms, walls)
    const items = planAirconPlacements(p, buildAirconSystemPlan(p))
    const condensers = items.filter((i) => i.defId === 'aircon-condenser')
    expect(condensers.length).toBeGreaterThan(0)
    expect(condensers.every((c) => c.roomId === 'yard')).toBe(true)
  })

  it('skips condensers when there is no ledge / yard / balcony', () => {
    const rooms = [rectRoom('m', 'Master', 0, 0, 3, 3, 'masterBedroom')]
    const p = plan(rooms, rectWalls('m', 0, 0, 3, 3))
    const items = planAirconPlacements(p, buildAirconSystemPlan(p))
    expect(items.filter((i) => i.defId === 'aircon-condenser')).toHaveLength(0)
    expect(items.filter((i) => i.defId === 'aircon-unit')).toHaveLength(1)
  })
})

describe('findLedgeRoom', () => {
  it('prefers an AC-ledge name, then service yard, then balcony', () => {
    const base = (rooms: PlanRoom[]) => plan(rooms, [])
    expect(
      findLedgeRoom(
        base([
          rectRoom('y', 'Service Yard', 0, 0, 2, 2, 'serviceYard'),
          rectRoom('l', 'AC Ledge', 3, 0, 1, 1, 'other'),
        ]),
      ),
    ).toBe('l')
    expect(findLedgeRoom(base([rectRoom('y', 'Service Yard', 0, 0, 2, 2, 'serviceYard')]))).toBe(
      'y',
    )
    expect(findLedgeRoom(base([rectRoom('b', 'Balcony', 0, 0, 2, 2, 'balcony')]))).toBe('b')
    expect(findLedgeRoom(base([rectRoom('m', 'Master', 0, 0, 3, 3, 'masterBedroom')]))).toBeNull()
  })
})
