import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanElectricalPoint, PlanRoom } from '../floorplan/types'
import {
  buildSocketAdvisory,
  DB_LOAD_NOTE,
  TARGET_SOCKETS_BY_CATEGORY,
  targetSocketsFor,
} from './socketAdvisory'

/** A room rectangle from (x0,z0) sized w×d — big enough to hold test points. */
function room(id: string, name: string, category?: PlanRoom['category']): PlanRoom {
  return { id, name, category, origin: [0, 0], width: 10, depth: 10 }
}

function pt(x: number, z: number, kind: PlanElectricalPoint['kind']): PlanElectricalPoint {
  return { id: `${kind}-${x}-${z}`, x, z, kind }
}

/** Plan with a single room and the given electrical points inside it. */
function planWith(r: PlanRoom, points: PlanElectricalPoint[]): FloorPlan {
  return {
    id: 'p',
    name: 'test',
    ceilingHeight: 2.6,
    extent: [10, 10],
    walls: [],
    openings: [],
    rooms: [r],
    electricalPoints: points,
  }
}

describe('buildSocketAdvisory', () => {
  it('targets each category via an explicit category', () => {
    for (const [category, target] of Object.entries(TARGET_SOCKETS_BY_CATEGORY)) {
      const adv = buildSocketAdvisory(
        planWith(room('r', 'Room', category as PlanRoom['category']), []),
      )
      expect(adv.rooms).toHaveLength(1)
      expect(adv.rooms[0].category).toBe(category)
      expect(adv.rooms[0].target).toBe(target)
    }
  })

  it('infers category from the room name when no explicit category', () => {
    const adv = buildSocketAdvisory(planWith(room('r', 'Master Bedroom'), []))
    expect(adv.rooms[0].category).toBe('masterBedroom')
    expect(adv.rooms[0].target).toBe(6)
  })

  it('matches the documented per-category targets', () => {
    expect(TARGET_SOCKETS_BY_CATEGORY).toMatchObject({
      living: 8,
      kitchen: 10,
      masterBedroom: 6,
      bedroom: 4,
      study: 6,
      dining: 4,
      bath: 2,
      powder: 1,
      serviceYard: 2,
    })
    // storeroom / balcony / foyer / other have no target.
    expect(targetSocketsFor('storeroom')).toBe(0)
    expect(targetSocketsFor('balcony')).toBe(0)
    expect(targetSocketsFor('foyer')).toBe(0)
    expect(targetSocketsFor('other')).toBe(0)
  })

  it('counts a socket as 1 outlet and a socket-double as 2', () => {
    const adv = buildSocketAdvisory(
      planWith(room('r', 'Living', 'living'), [pt(1, 1, 'socket'), pt(2, 2, 'socket-double')]),
    )
    // 1 + 2 = 3 outlets placed.
    expect(adv.rooms[0].placed).toBe(3)
    expect(adv.totalPlaced).toBe(3)
  })

  it('reports data / tv points separately, never as sockets', () => {
    const adv = buildSocketAdvisory(
      planWith(room('r', 'Living', 'living'), [
        pt(1, 1, 'socket'),
        pt(2, 2, 'data'),
        pt(3, 3, 'tv-point'),
        pt(4, 4, 'switch'),
      ]),
    )
    expect(adv.rooms[0].placed).toBe(1) // only the socket
    expect(adv.rooms[0].dataPlaced).toBe(2) // data + tv-point
  })

  it('computes shortfall = max(0, target - placed) and detects under-provision', () => {
    // Living target 8; place 3 outlets → shortfall 5, under-provisioned.
    const under = buildSocketAdvisory(
      planWith(room('r', 'Living', 'living'), [pt(1, 1, 'socket'), pt(2, 2, 'socket-double')]),
    )
    expect(under.rooms[0].shortfall).toBe(5)
    expect(under.rooms[0].underProvisioned).toBe(true)
    expect(under.underProvisionedCount).toBe(1)
  })

  it('clamps shortfall at 0 and is not under-provisioned when target met/exceeded', () => {
    // Powder target 1; place 2 → shortfall 0, not under-provisioned.
    const ok = buildSocketAdvisory(
      planWith(room('r', 'Powder', 'powder'), [pt(1, 1, 'socket-double')]),
    )
    expect(ok.rooms[0].placed).toBe(2)
    expect(ok.rooms[0].shortfall).toBe(0)
    expect(ok.rooms[0].underProvisioned).toBe(false)
    expect(ok.underProvisionedCount).toBe(0)
  })

  it('omits rooms with no socket target', () => {
    const plan: FloorPlan = {
      id: 'p',
      name: 't',
      ceilingHeight: 2.6,
      extent: [20, 10],
      walls: [],
      openings: [],
      rooms: [
        room('a', 'Living', 'living'),
        { id: 'b', name: 'Store', category: 'storeroom', origin: [10, 0], width: 5, depth: 5 },
      ],
      electricalPoints: [],
    }
    const adv = buildSocketAdvisory(plan)
    expect(adv.rooms.map((r) => r.roomId)).toEqual(['a'])
  })

  it('ignores points that fall outside every room', () => {
    // Point at (50,50) is well outside the 10×10 room.
    const adv = buildSocketAdvisory(
      planWith(room('r', 'Living', 'living'), [pt(1, 1, 'socket'), pt(50, 50, 'socket')]),
    )
    expect(adv.rooms[0].placed).toBe(1)
    expect(adv.totalPlaced).toBe(1)
  })

  it('never NaNs on an empty plan', () => {
    const empty: FloorPlan = {
      id: 'p',
      name: 't',
      ceilingHeight: 2.6,
      extent: [10, 10],
      walls: [],
      openings: [],
      rooms: [],
    }
    const adv = buildSocketAdvisory(empty)
    expect(adv.rooms).toEqual([])
    expect(adv.underProvisionedCount).toBe(0)
    expect(adv.totalTarget).toBe(0)
    expect(adv.totalPlaced).toBe(0)
    expect(Number.isNaN(adv.totalPlaced)).toBe(false)
  })

  it('exposes the DB-load note', () => {
    const adv = buildSocketAdvisory(planWith(room('r', 'Living', 'living'), []))
    expect(adv.dbNote).toBe(DB_LOAD_NOTE)
    expect(DB_LOAD_NOTE).toContain('40 A')
    expect(DB_LOAD_NOTE).toContain('SP Group')
  })

  it('sums totals across multiple rooms', () => {
    const plan: FloorPlan = {
      id: 'p',
      name: 't',
      ceilingHeight: 2.6,
      extent: [30, 10],
      walls: [],
      openings: [],
      rooms: [
        { id: 'a', name: 'Living', category: 'living', origin: [0, 0], width: 10, depth: 10 },
        { id: 'b', name: 'Kitchen', category: 'kitchen', origin: [10, 0], width: 10, depth: 10 },
      ],
      electricalPoints: [pt(1, 1, 'socket'), pt(11, 1, 'socket-double')],
    }
    const adv = buildSocketAdvisory(plan)
    expect(adv.totalTarget).toBe(18) // 8 + 10
    expect(adv.totalPlaced).toBe(3) // 1 + 2
    expect(adv.underProvisionedCount).toBe(2)
  })
})
