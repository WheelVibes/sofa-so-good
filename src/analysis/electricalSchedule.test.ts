import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanElectricalPoint, PlanRoom } from '../floorplan/types'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import {
  buildDesignedElectricalSchedule,
  buildElectricalSchedule,
  isLightingPoint,
  MIN_SOCKETS_BY_KIND,
  SOCKETS_PER_CATEGORY,
  socketsForCategory,
} from './electricalSchedule'

// --- Tiny synthetic fixtures (no dependency on the real catalog/defaults) ----

const room = (id: string, name: string, origin: [number, number] = [0, 0]): PlanRoom => ({
  id,
  name,
  origin,
  width: 4,
  depth: 4,
})

const plan = (rooms: PlanRoom[], upper?: PlanRoom[]): FloorPlan =>
  ({
    name: 'Test',
    extent: [20, 20],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms,
    ...(upper
      ? {
          upperLevels: [
            {
              id: 'up',
              name: 'Upper storey',
              elevation: 2.9,
              walls: [],
              openings: [],
              rooms: upper,
            },
          ],
        }
      : {}),
  }) as unknown as FloorPlan

const def = (id: string, category: FurnitureCategory): FurnitureDef =>
  ({
    id,
    name: id,
    kind: 'parametric',
    category,
    primitive: 'Sofa',
    paramSchema: [],
    defaultFootprint: { w: 1, d: 1, h: 1 },
  }) as FurnitureDef

// Place an item at the centre of room `r`.
const item = (id: string, defId: string, r: PlanRoom, levelId?: string): FurnitureItem => ({
  id,
  defId,
  position: [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2],
  rotation: 0,
  props: {},
  ...(levelId ? { levelId } : {}),
})

const catalog = (defs: FurnitureDef[]): Record<string, FurnitureDef> =>
  Object.fromEntries(defs.map((d) => [d.id, d]))

describe('socketsForCategory + isLightingPoint', () => {
  it('maps powered categories to indicative socket counts; unpowered → 0', () => {
    expect(socketsForCategory('kitchen')).toBe(SOCKETS_PER_CATEGORY.kitchen)
    expect(socketsForCategory('appliances')).toBe(1)
    expect(socketsForCategory('electronics')).toBe(1)
    expect(socketsForCategory('laundry')).toBe(1)
    // Lighting is counted as a lighting point, not a socket.
    expect(socketsForCategory('lighting')).toBe(0)
    expect(socketsForCategory('seating')).toBe(0)
    expect(socketsForCategory('beds')).toBe(0)
    expect(socketsForCategory('decor')).toBe(0)
  })

  it('detects light emitters via the shared lighting-plan predicate', () => {
    const mk = (defId: string, props: Record<string, string> = {}): FurnitureItem => ({
      id: 'x',
      defId,
      position: [0, 0],
      rotation: 0,
      props,
    })
    // A registered fixture def (ceiling-light) is a lighting point.
    expect(isLightingPoint(mk('ceiling-light'))).toBe(true)
    // A plain sofa is not.
    expect(isLightingPoint(mk('sofa-3seat'))).toBe(false)
    // Any item flagged lightOn:'yes' counts (user light-source override).
    expect(isLightingPoint(mk('sofa-3seat', { lightOn: 'yes' }))).toBe(true)
  })
})

describe('buildElectricalSchedule', () => {
  it('counts lighting points per room from light emitters', () => {
    const living = room('lr', 'Living Room')
    const defs = catalog([def('ceiling-light', 'lighting'), def('floor-lamp', 'lighting')])
    const items = [item('a', 'ceiling-light', living), item('b', 'floor-lamp', living)]
    const sched = buildElectricalSchedule(plan([living]), items, defs)
    const lr = sched.rooms.find((r) => r.roomId === 'lr')!
    expect(lr.lightingPoints).toBe(2)
    expect(sched.totalLighting).toBe(2)
  })

  it('infers power points from powered furniture categories present in the room', () => {
    const kitchen = room('k', 'Kitchen')
    const defs = catalog([
      def('fridge', 'appliances'),
      def('counter', 'kitchen'),
      def('washer', 'laundry'),
    ])
    const items = [
      item('a', 'fridge', kitchen), // appliances → 1
      item('b', 'counter', kitchen), // kitchen → 2
      item('c', 'washer', kitchen), // laundry → 1
    ]
    const sched = buildElectricalSchedule(plan([kitchen]), items, defs)
    const k = sched.rooms.find((r) => r.roomId === 'k')!
    // 1 + 2 + 1 = 4 inferred (also the kitchen floor of 4) — no lights.
    expect(k.lightingPoints).toBe(0)
    expect(k.powerPoints).toBe(4)
    expect(k.total).toBe(4)
  })

  it('floors a habitable room with no powered items to its per-kind minimum', () => {
    const bed = room('br', 'Master Bedroom')
    const defs = catalog([def('bed', 'beds'), def('ceiling-light', 'lighting')])
    // Only a bed (no power) + a ceiling light.
    const items = [item('a', 'bed', bed), item('b', 'ceiling-light', bed)]
    const sched = buildElectricalSchedule(plan([bed]), items, defs)
    const br = sched.rooms.find((r) => r.roomId === 'br')!
    expect(br.lightingPoints).toBe(1)
    // bedroom floor = 2 sockets even with no powered pieces.
    expect(br.powerPoints).toBe(MIN_SOCKETS_BY_KIND.bedroom)
    expect(br.powerPoints).toBe(2)
  })

  it('inferred power above the floor wins over the per-kind minimum', () => {
    const kitchen = room('k', 'Kitchen')
    const defs = catalog([def('a1', 'appliances'), def('a2', 'appliances'), def('ktc', 'kitchen')])
    // 1 + 1 + 2 = 4 inferred; kitchen floor is also 4 → 4.
    const items = [item('i1', 'a1', kitchen), item('i2', 'a2', kitchen), item('i3', 'ktc', kitchen)]
    const sched = buildElectricalSchedule(plan([kitchen]), items, defs)
    const k = sched.rooms.find((r) => r.roomId === 'k')!
    expect(k.powerPoints).toBe(4)

    // Add another appliance → 5 inferred, now above the floor.
    const more = [...items, item('i4', 'a1', kitchen)]
    const sched2 = buildElectricalSchedule(plan([kitchen]), more, defs)
    expect(sched2.rooms.find((r) => r.roomId === 'k')!.powerPoints).toBe(5)
  })

  it('counts an unknown-kind room by its items even without a floor', () => {
    const foyer = room('f', 'Foyer') // roomKindFromName → 'other' (floor 1)
    const defs = catalog([def('tv', 'electronics')])
    const items = [item('a', 'tv', foyer)]
    const sched = buildElectricalSchedule(plan([foyer]), items, defs)
    const f = sched.rooms.find((r) => r.roomId === 'f')!
    expect(f.kind).toBe('other')
    // 1 from the TV (electronics), the 'other' floor is also 1.
    expect(f.powerPoints).toBe(1)
  })

  it('honours an explicit room category over the name (RM1)', () => {
    // "Ella's room" infers to 'other' (floor 1); an explicit bedroom category
    // downmaps to bedroom (floor 2).
    const kids: PlanRoom = { ...room('kr', "Ella's room"), category: 'bedroom' }
    const defs = catalog([def('bed', 'beds')])
    const items = [item('a', 'bed', kids)]
    const sched = buildElectricalSchedule(plan([kids]), items, defs)
    const kr = sched.rooms.find((r) => r.roomId === 'kr')!
    expect(kr.kind).toBe('bedroom')
    expect(kr.powerPoints).toBe(MIN_SOCKETS_BY_KIND.bedroom)
    expect(kr.powerPoints).toBe(2)
  })

  it('handles an empty plan with no NaN — zeroed totals, no rows', () => {
    const sched = buildElectricalSchedule(plan([]), [], {})
    expect(sched.rooms).toEqual([])
    expect(sched.totalLighting).toBe(0)
    expect(sched.totalPower).toBe(0)
    expect(sched.total).toBe(0)
    expect(Number.isNaN(sched.total)).toBe(false)
  })

  it('omits service/external rooms with no lights or power (no floor)', () => {
    const store = room('st', 'Storeroom') // kind 'balcony' → no floor
    const defs = catalog([def('box', 'storage')]) // storage draws no power
    const items = [item('a', 'box', store)]
    const sched = buildElectricalSchedule(plan([store]), items, defs)
    // Nothing to show → row skipped.
    expect(sched.rooms.find((r) => r.roomId === 'st')).toBeUndefined()
  })

  it('attributes items across storeys and computes a grand total', () => {
    const ground = room('g', 'Living Room', [0, 0])
    // Distinct footprint so the (overlapping-coords) attribution is unambiguous.
    const up = room('u', 'Bedroom', [10, 10])
    const defs = catalog([
      def('ceiling-light', 'lighting'),
      def('tv', 'electronics'),
      def('bed', 'beds'),
    ])
    const items = [
      item('a', 'ceiling-light', ground), // ground lighting
      item('b', 'tv', ground), // ground power (electronics → 1, living floor 4 → 4)
      item('c', 'ceiling-light', up, 'up'), // upper lighting
      item('d', 'bed', up, 'up'), // upper bed (bedroom floor 2)
    ]
    const sched = buildElectricalSchedule(plan([ground], [up]), items, defs)
    const g = sched.rooms.find((r) => r.roomId === 'g')!
    const u = sched.rooms.find((r) => r.roomId === 'u')!
    expect(g.lightingPoints).toBe(1)
    expect(g.powerPoints).toBe(4) // living floor
    expect(u.lightingPoints).toBe(1)
    expect(u.powerPoints).toBe(2) // bedroom floor
    expect(sched.totalLighting).toBe(2)
    expect(sched.totalPower).toBe(6)
    expect(sched.total).toBe(8)
  })

  it('collects items outside every room into an Unassigned row', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const defs = catalog([def('tv', 'electronics')])
    // Place far outside the 4×4 room.
    const stray: FurnitureItem = {
      id: 'x',
      defId: 'tv',
      position: [50, 50],
      rotation: 0,
      props: {},
    }
    const sched = buildElectricalSchedule(plan([lr]), [stray], defs)
    const un = sched.rooms.find((r) => r.roomName === 'Unassigned')!
    expect(un).toBeDefined()
    expect(un.powerPoints).toBe(1)
    expect(un.roomId).toBe('')
  })

  it('is deterministic — same input yields identical output', () => {
    const lr = room('lr', 'Living Room')
    const defs = catalog([def('ceiling-light', 'lighting'), def('tv', 'electronics')])
    const items = [item('a', 'ceiling-light', lr), item('b', 'tv', lr)]
    const p = plan([lr])
    const a = buildElectricalSchedule(p, items, defs)
    const b = buildElectricalSchedule(p, items, defs)
    expect(a).toEqual(b)
  })
})

describe('buildDesignedElectricalSchedule (H-D3)', () => {
  const pt = (over: Partial<PlanElectricalPoint>): PlanElectricalPoint => ({
    id: 'p',
    x: 2,
    z: 2,
    kind: 'socket',
    ...over,
  })

  it('counts designed points per room, not lighting/power', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const p = plan([lr])
    const sched = buildDesignedElectricalSchedule(p, [
      pt({ id: 'a', x: 1, z: 1, kind: 'socket', mountHeightMm: 300 }),
      pt({ id: 'b', x: 2, z: 2, kind: 'switch', mountHeightMm: 1200 }),
    ])
    expect(sched.total).toBe(2)
    expect(sched.rooms).toEqual([{ roomId: 'lr', roomName: 'Living Room', count: 2 }])
  })

  it('summarizes distinct mount heights with counts, ascending', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const p = plan([lr])
    const sched = buildDesignedElectricalSchedule(p, [
      pt({ id: 'a', x: 1, z: 1, kind: 'socket', mountHeightMm: 300 }),
      pt({ id: 'b', x: 1.2, z: 1, kind: 'socket', mountHeightMm: 300 }),
      pt({ id: 'c', x: 2, z: 2, kind: 'switch', mountHeightMm: 1200 }),
    ])
    expect(sched.heights).toEqual([
      { heightMm: 300, count: 2 },
      { heightMm: 1200, count: 1 },
    ])
  })

  it('falls back to the per-kind default mount height when a point has none', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const p = plan([lr])
    const sched = buildDesignedElectricalSchedule(p, [pt({ id: 'a', x: 1, z: 1, kind: 'switch' })])
    // Switch default AFFL is 1200mm (mepPoints.ts's ELECTRICAL_MOUNT_DEFAULTS_MM).
    expect(sched.heights).toEqual([{ heightMm: 1200, count: 1 }])
  })

  it('collects out-of-room points into an Unassigned row', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const p = plan([lr])
    const sched = buildDesignedElectricalSchedule(p, [pt({ id: 'a', x: 50, z: 50 })])
    expect(sched.rooms).toEqual([{ roomId: '', roomName: 'Unassigned', count: 1 }])
    expect(sched.total).toBe(1)
  })

  it('is empty for no designed points', () => {
    const lr = room('lr', 'Living Room', [0, 0])
    const sched = buildDesignedElectricalSchedule(plan([lr]), [])
    expect(sched).toEqual({ rooms: [], total: 0, heights: [] })
  })
})
