import { afterEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/flags/resolve'
import {
  buildReflectedCeilingPlan,
  CEILING_FIXTURE_TYPES,
  type RcpFixtureInput,
  type RcpTrunkingItemInput,
} from './rcp'
import type { FloorPlan, PlanElectricalPoint, PlanOpening, PlanRoom, PlanWall } from './types'

const box: FloorPlan['walls'] = [
  { id: 'a', start: [0, 0], end: [4, 0], thickness: 'external' },
  { id: 'b', start: [4, 0], end: [4, 4], thickness: 'external' },
  { id: 'c', start: [4, 4], end: [0, 4], thickness: 'external' },
  { id: 'd', start: [0, 4], end: [0, 0], thickness: 'external' },
]

function plan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls: box,
    openings: [],
    rooms,
  }
}

const flatRoom: PlanRoom = {
  id: 'r1',
  name: 'Living',
  origin: [0, 0],
  width: 4,
  depth: 4,
}

describe('buildReflectedCeilingPlan — zones', () => {
  it('flat room (no ceiling config) gets the FFL-to-clg note in mm from the plan default', () => {
    const rcp = buildReflectedCeilingPlan(plan([flatRoom]), [], [])
    expect(rcp.zones).toHaveLength(1)
    const z = rcp.zones[0]!
    expect(z.roomName).toBe('Living')
    expect(z.ceilingHeightMm).toBe(2600)
    expect(z.note).toBe('FFL to clg: 2600mm')
    expect(z.treatment).toBeUndefined()
  })

  it('a room-level ceilingHeight override wins over the plan default', () => {
    const room: PlanRoom = { ...flatRoom, ceilingHeight: 2.4 }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    expect(rcp.zones[0]!.ceilingHeightMm).toBe(2400)
    expect(rcp.zones[0]!.note).toBe('FFL to clg: 2400mm')
  })

  it('tray ceiling: note + inset rect match the shared 3D geometry engine exactly', () => {
    const room: PlanRoom = {
      ...flatRoom,
      ceiling: { style: 'tray', drop: 0.15, margin: 0.3 },
    }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    const z = rcp.zones[0]!
    // Hand-computed against `ceilingModel.ts:buildCeiling`: h=2.6, drop clamped
    // to 0.15 (within [0.03, min(0.4, 2.6-2.0)=0.4]), margin clamped to 0.3
    // (within [0.1, min(4,4)/2-0.1=1.9]) → yLow = 2.6-0.15 = 2.45 → 2450mm.
    expect(z.treatment).toBeDefined()
    expect(z.treatment!.style).toBe('tray')
    expect(z.treatment!.dropToMm).toBe(2450)
    expect(z.note).toBe('FFL to false ceiling: 2450mm (Tray)')
    // Inner (raised centre) rect: bbox 0..4 both axes, margin 0.3 → inner
    // 3.4×3.4 centred at (2,2).
    expect(z.treatment!.rect).toEqual({ cx: 2, cz: 2, w: 3.4, d: 3.4 })
    expect(z.treatment!.beams).toBeUndefined()
  })

  it('dropped ceiling: soffit inset rect + drop height', () => {
    const room: PlanRoom = {
      ...flatRoom,
      ceiling: { style: 'dropped', drop: 0.2, margin: 0.5 },
    }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    const z = rcp.zones[0]!
    expect(z.treatment!.dropToMm).toBe(2400) // 2.6 - 0.2 = 2.4m
    expect(z.treatment!.rect).toEqual({ cx: 2, cz: 2, w: 3, d: 3 }) // 4 - 2*0.5
    expect(z.note).toBe('FFL to false ceiling: 2400mm (Dropped)')
  })

  it('coffered ceiling: beam grid present, no single inset rect', () => {
    const room: PlanRoom = {
      ...flatRoom,
      ceiling: { style: 'coffered', drop: 0.1, grid: [2, 2] },
    }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    const z = rcp.zones[0]!
    expect(z.treatment!.rect).toBeUndefined()
    expect(z.treatment!.beams).toBeDefined()
    // 2 cols + 1 = 3 vertical beams, 2 rows + 1 = 3 horizontal beams.
    expect(z.treatment!.beams!.length).toBe(6)
    expect(z.treatment!.dropToMm).toBe(2500) // 2.6 - 0.1
  })

  it('sloped ceiling: high/low edge note, no rect', () => {
    const room: PlanRoom = {
      ...flatRoom,
      ceiling: { style: 'sloped', slope: { axis: 'x', rise: 0.4 } },
    }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    const z = rcp.zones[0]!
    expect(z.treatment!.rect).toBeUndefined()
    expect(z.treatment!.beams).toBeUndefined()
    expect(z.treatment!.dropToMm).toBe(2200) // 2.6 - 0.4
    expect(z.note).toBe('FFL to clg: 2600mm at high edge, 2200mm at low edge (Sloped)')
  })

  it('falls back to flat when the ceiling model rejects the treatment (non-rect room)', () => {
    // An L-shaped (non-axis-aligned-rect) polygon room.
    const room: PlanRoom = {
      id: 'r2',
      name: 'L-room',
      origin: [0, 0],
      width: 4,
      depth: 4,
      polygon: [
        [0, 0],
        [4, 0],
        [4, 4],
        [2, 4],
        [2, 2],
        [0, 2],
      ],
      ceiling: { style: 'tray' },
    }
    const rcp = buildReflectedCeilingPlan(plan([room]), [], [])
    const z = rcp.zones[0]!
    expect(z.treatment).toBeUndefined()
    expect(z.note).toContain('treatment not applied')
  })
})

describe('buildReflectedCeilingPlan — fixtures', () => {
  const fixtureBox = plan([flatRoom])

  it('filters to ceiling-mounted fixture types only', () => {
    const fixtures: RcpFixtureInput[] = [
      { id: 'f1', type: 'ceiling-light', label: 'Flush mount', x: 2, z: 0.5 },
      { id: 'f2', type: 'floor-lamp', label: 'Arc lamp', x: 1, z: 1 },
      { id: 'f3', type: 'ceiling-fan', label: 'Ceiling fan', x: 2, z: 2 },
      { id: 'f4', type: 'table-lamp', label: 'Table lamp', x: 3, z: 3 },
    ]
    const rcp = buildReflectedCeilingPlan(fixtureBox, fixtures, [])
    expect(rcp.fixtures.map((f) => f.id)).toEqual(['f1', 'f3'])
    expect(CEILING_FIXTURE_TYPES.has('floor-lamp')).toBe(false)
  })

  it('dimensions a fixture off the nearest wall on each axis (centreline distance)', () => {
    // Box walls: x=0/x=4 (vertical), z=0/z=4 (horizontal). Fixture at (1, 0.5)
    // is 1m from x=0 (nearer than 3m from x=4) and 0.5m from z=0 (nearer than
    // 3.5m from z=4).
    const fixtures: RcpFixtureInput[] = [
      { id: 'f1', type: 'ceiling-light', label: 'Flush mount', x: 1, z: 0.5 },
    ]
    const rcp = buildReflectedCeilingPlan(fixtureBox, fixtures, [])
    const f = rcp.fixtures[0]!
    expect(f.dimX).toEqual({ faceX: 0, distance: 1 })
    expect(f.dimZ).toEqual({ faceZ: 0, distance: 0.5 })
  })

  it('dimX/dimZ are null when the storey has no wall of that orientation', () => {
    const noWalls: FloorPlan = { ...fixtureBox, walls: [] }
    const fixtures: RcpFixtureInput[] = [
      { id: 'f1', type: 'ceiling-light', label: 'Flush mount', x: 1, z: 1 },
    ]
    const rcp = buildReflectedCeilingPlan(noWalls, fixtures, [])
    expect(rcp.fixtures[0]!.dimX).toBeNull()
    expect(rcp.fixtures[0]!.dimZ).toBeNull()
  })
})

describe('buildReflectedCeilingPlan — aircon', () => {
  it('marks aircon points only, with a default mount height when unset', () => {
    const points: PlanElectricalPoint[] = [
      { id: 'e1', x: 3.8, z: 0.2, kind: 'aircon' },
      { id: 'e2', x: 3.8, z: 0.5, kind: 'aircon', mountHeightMm: 2500, label: 'Living AC' },
      { id: 'e3', x: 1, z: 1, kind: 'socket' },
    ]
    const rcp = buildReflectedCeilingPlan(plan([flatRoom]), [], points)
    expect(rcp.aircon).toHaveLength(2)
    expect(rcp.aircon[0]!.mountHeightMm).toBe(2400) // ELECTRICAL_MOUNT_DEFAULTS_MM.aircon
    expect(rcp.aircon[1]).toEqual({ x: 3.8, z: 0.5, mountHeightMm: 2500, label: 'Living AC' })
  })
})

describe('buildReflectedCeilingPlan — trunking (BSJ-2 follow-up)', () => {
  // The app boots in Simple mode (`featureFlagsSlice.ts`'s module-level seed),
  // which forces every pro flag off — force Pro mode here so `airconTrunking`
  // resolves on, matching how `rcpSvg.test.ts` handles the same module-load
  // ordering quirk. Restored after each test.
  setResolvedFlags(resolveFlags(false, {}, false, 'pro'))
  afterEach(() => {
    setResolvedFlags(resolveFlags(false, {}, false, 'pro'))
  })

  function twoRoomWalls(): PlanWall[] {
    return [
      { id: 'liv-n', start: [0, 0], end: [5, 0], thickness: 'external' },
      { id: 'liv-s', start: [0, 4], end: [5, 4], thickness: 'internal' },
      { id: 'liv-w', start: [0, 0], end: [0, 4], thickness: 'internal' },
      // Shared wall between living + master, carries the door.
      { id: 'liv-e', start: [5, 0], end: [5, 4], thickness: 'internal' },
      { id: 'mas-n', start: [5, 0], end: [9, 0], thickness: 'external' },
      { id: 'mas-s', start: [5, 4], end: [9, 4], thickness: 'internal' },
      { id: 'mas-e', start: [9, 0], end: [9, 4], thickness: 'internal' },
      // AC ledge, off the living room — the fallback proposal (no items
      // placed) needs a ledge/yard/balcony room to place a condenser onto.
      { id: 'ledge-n', start: [0, -1.2], end: [5, -1.2], thickness: 'external' },
      { id: 'ledge-s', start: [0, 0], end: [5, 0], thickness: 'internal' },
      { id: 'ledge-w', start: [0, -1.2], end: [0, 0], thickness: 'internal' },
      { id: 'ledge-e', start: [5, -1.2], end: [5, 0], thickness: 'internal' },
    ]
  }

  function twoRoomPlan(): FloorPlan {
    const rooms: PlanRoom[] = [
      {
        id: 'living',
        name: 'Living / Dining',
        origin: [0, 0],
        width: 5,
        depth: 4,
        category: 'living',
      },
      {
        id: 'master',
        name: 'Master Bedroom',
        origin: [5, 0],
        width: 4,
        depth: 4,
        category: 'masterBedroom',
      },
      { id: 'ledge', name: 'AC Ledge', origin: [0, -1.2], width: 5, depth: 1.2, category: 'other' },
    ]
    const openings: PlanOpening[] = [
      { id: 'd1', kind: 'door', wallId: 'liv-e', offset: 1, width: 1, sill: 0, head: 2.1 },
      // Ledge's own service door back into living (living-n / ledge-s share
      // the same span) so the router can cross from the ledge to the FCUs.
      { id: 'd2', kind: 'door', wallId: 'liv-n', offset: 1, width: 1, sill: 0, head: 2.1 },
    ]
    return {
      id: 'p2',
      name: 'Test',
      ceilingHeight: 2.8,
      extent: [9, 4],
      walls: twoRoomWalls(),
      openings,
      rooms,
    }
  }

  it('marks a resolved trunking route with the aircon flag on', () => {
    // Both served rooms (living + master, each their own zone → their own
    // condenser) need a placed FCU; living's condenser sits in the room itself.
    const items: RcpTrunkingItemInput[] = [
      { defId: 'aircon-unit', roomId: 'living', position: [1, 1] },
      { defId: 'aircon-condenser', roomId: 'living', position: [0.3, 0.3] },
      { defId: 'aircon-unit', roomId: 'master', position: [8.5, 2] },
      { defId: 'aircon-condenser', roomId: 'master', position: [8.7, 0.3] },
    ]
    const rcp = buildReflectedCeilingPlan(twoRoomPlan(), [], [], items, 0)
    expect(rcp.trunking.length).toBeGreaterThan(0)
    const run = rcp.trunking.find((r) => r.roomName === 'Master Bedroom')!
    expect(run.points.length).toBeGreaterThanOrEqual(2)
    expect(run.lengthM).toBeGreaterThan(0)
  })

  it('falls back to the planner proposal when no aircon items are placed yet', () => {
    // No placed items at all — mirrors the allocator's own fallback, so the
    // sheet still shows a proposed route rather than nothing.
    const rcp = buildReflectedCeilingPlan(twoRoomPlan(), [], [], [], 0)
    expect(rcp.trunking.length).toBeGreaterThan(0)
  })

  it('returns no trunking when the plan has no habitable rooms to serve', () => {
    const emptyPlan: FloorPlan = {
      id: 'p3',
      name: 'Test',
      ceilingHeight: 2.8,
      extent: [4, 4],
      walls: box,
      openings: [],
      rooms: [],
    }
    const rcp = buildReflectedCeilingPlan(emptyPlan, [], [], [], 0)
    expect(rcp.trunking).toEqual([])
  })
})
