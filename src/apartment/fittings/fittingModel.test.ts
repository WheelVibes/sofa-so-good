import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { planWallThickness } from '../../floorplan/planGeometry'
import { pointInRoom } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { deriveElectricalPoints } from '../../furniture/mepSuggest'
import type { FurnitureItem } from '../../furniture/types'
import {
  DB_BOX,
  fittingsForRoom,
  GENERAL_SOCKET_MIN_WALL_M,
  generalSockets,
  mainDoor,
  PLATE_DEPTH_M,
  ROOM_FILTER_PROBE_M,
  resolveWallFittings,
  rightNormal,
  WALL_SNAP_M,
} from './fittingModel'

const plan = buildDefaultPlan()
const items = defaultLayout().map(
  (e) => ({ ...e, rotation: e.rotation ?? 0, props: e.props ?? {} }) as FurnitureItem,
)
const derived = deriveElectricalPoints(plan, items, BUILTIN_CATALOG)
const fittings = resolveWallFittings(plan, [...derived, ...generalSockets(plan, derived)])

/** Perpendicular distance from a point to a wall's centreline segment. */
function distToWall(x: number, z: number, wallId: string): number {
  const w = plan.walls.find((ww) => ww.id === wallId)!
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz)
  const t = Math.max(0, Math.min(1, ((x - w.start[0]) * dx + (z - w.start[1]) * dz) / (len * len)))
  return Math.hypot(x - (w.start[0] + t * dx), z - (w.start[1] + t * dz))
}

describe('resolveWallFittings on the default flat', () => {
  it('mounts a switch for every door and sockets for the appliances', () => {
    const doors = plan.openings.filter((o) => o.kind === 'door').length
    const switches = fittings.filter((f) => f.kind === 'switch').length
    expect(switches).toBe(doors)
    expect(fittings.filter((f) => f.kind === 'socket').length).toBeGreaterThan(3)
    expect(fittings.length).toBeGreaterThan(doors + 3)
  })

  it('every plate sits proud of its host wall face by half its depth, never inside the wall', () => {
    for (const f of fittings) {
      const w = plan.walls.find((ww) => ww.id === f.wallId)!
      const depth = f.kind === 'db-box' ? DB_BOX.d : PLATE_DEPTH_M
      const expected = planWallThickness(w, plan) / 2 + depth / 2
      expect(distToWall(f.x, f.z, f.wallId)).toBeCloseTo(expected, 3)
    }
  })

  it('plates face away from their wall (+Z of the yaw points along the outward normal)', () => {
    for (const f of fittings) {
      const w = plan.walls.find((ww) => ww.id === f.wallId)!
      const [nx, nz] = rightNormal(w)
      const dirX = Math.sin(f.yaw)
      const dirZ = Math.cos(f.yaw)
      // Facing must be ±the wall's normal, and stepping along it must move AWAY from the wall.
      expect(Math.abs(dirX * nx + dirZ * nz)).toBeCloseTo(1, 5)
      const before = distToWall(f.x, f.z, f.wallId)
      const after = distToWall(f.x + dirX * 0.05, f.z + dirZ * 0.05, f.wallId)
      expect(after).toBeGreaterThan(before)
    }
  })

  it('uses the MEP layer mount heights: switches 1.2 m, sockets 0.3 m, aircon 2.4 m', () => {
    for (const f of fittings) {
      if (f.kind === 'switch') expect(f.y).toBeCloseTo(1.2, 6)
      if (f.kind === 'socket') expect(f.y).toBeCloseTo(0.3, 6)
      if (f.kind === 'aircon') expect(f.y).toBeCloseTo(2.4, 6)
    }
  })

  it('puts exactly one distribution board inside the main door on an external wall', () => {
    const md = mainDoor(plan)!
    expect(md.wall.thickness).toBe('external')
    const db = fittings.filter((f) => f.kind === 'db-box')
    expect(db).toHaveLength(1)
    expect(db[0].wallId).toBe(md.wall.id)
    expect(db[0].y).toBeCloseTo(DB_BOX.y, 6)
    // Inside the flat: the DB's outward direction points into a room, not the corridor.
    const dirX = Math.sin(db[0].yaw)
    const dirZ = Math.cos(db[0].yaw)
    const px = db[0].x + dirX * 0.3
    const pz = db[0].z + dirZ * 0.3
    // `pointInRoom` handles the foyer, which is an EXTENSION of living/dining, not its main rect.
    expect(plan.rooms.some((r) => pointInRoom(r, px, pz))).toBe(true)
  })

  it('drops points with no wall within reach instead of floating them', () => {
    const mid = resolveWallFittings(plan, [{ x: 10.9, z: 4.0, kind: 'socket' }])
    // (10.9, 4.0) is mid-living-room, > WALL_SNAP_M from every wall → only the DB survives.
    expect(mid.filter((f) => f.kind === 'socket')).toHaveLength(0)
    expect(WALL_SNAP_M).toBeLessThan(1)
  })

  it('honours a persisted mount height and skips upper-storey points', () => {
    const r = resolveWallFittings(plan, [
      { x: 9.7, z: 2.0, kind: 'socket', mountHeightMm: 1100 },
      { x: 9.7, z: 2.2, kind: 'socket', levelId: 'up' },
    ])
    const sockets = r.filter((f) => f.kind === 'socket')
    expect(sockets).toHaveLength(1)
    expect(sockets[0].y).toBeCloseTo(1.1, 6)
  })
})

describe('generalSockets — every long wall run gets a 13 A socket on its room side', () => {
  const general = generalSockets(plan, derived)
  it('adds sockets to rooms the derived layout left bare, never across an opening', () => {
    expect(general.length).toBeGreaterThan(6)
    expect(GENERAL_SOCKET_MIN_WALL_M).toBeGreaterThan(2)
    for (const g of general) {
      expect(g.kind).toBe('socket')
      // Every general socket stands inside some room (0.15 m off a face).
      expect(plan.rooms.some((r) => pointInRoom(r, g.x, g.z))).toBe(true)
    }
    // No two general sockets closer than the dedupe radius.
    for (let i = 0; i < general.length; i++)
      for (let j = i + 1; j < general.length; j++)
        expect(
          Math.hypot(general[i].x - general[j].x, general[i].z - general[j].z),
        ).toBeGreaterThanOrEqual(0.5)
  })
  it('the living/dining room, the largest, gets at least two', () => {
    const living = plan.rooms.find((r) => r.id === 'livingDining')!
    expect(general.filter((g) => pointInRoom(living, g.x, g.z)).length).toBeGreaterThanOrEqual(2)
  })
})

describe("fittingsForRoom — scoping a whole-flat fitting list to the room editor's one isolated room", () => {
  const living = fittingsForRoom(fittings, plan, 'livingDining')
  const bedroom = fittingsForRoom(fittings, plan, 'mainBedroom')

  it('keeps only fittings whose probe point (0.15 m along their own yaw) lands in that room', () => {
    expect(living.length).toBeGreaterThan(0)
    expect(living.length).toBeLessThan(fittings.length)
    for (const f of living) {
      const px = f.x + Math.sin(f.yaw) * ROOM_FILTER_PROBE_M
      const pz = f.z + Math.cos(f.yaw) * ROOM_FILTER_PROBE_M
      const room = plan.rooms.find((r) => r.id === 'livingDining')!
      expect(pointInRoom(room, px, pz)).toBe(true)
    }
  })

  it("drops the main bedroom's own fittings from the living/dining scope, and vice versa", () => {
    expect(bedroom.length).toBeGreaterThan(0)
    const livingIds = new Set(living)
    for (const f of bedroom) expect(livingIds.has(f)).toBe(false)
    const bedroomIds = new Set(bedroom)
    for (const f of living) expect(bedroomIds.has(f)).toBe(false)
  })

  it('an unknown room id yields an empty list rather than falling back to the whole flat', () => {
    expect(fittingsForRoom(fittings, plan, 'not-a-real-room')).toEqual([])
  })
})
