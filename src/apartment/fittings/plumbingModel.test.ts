import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { planWallThickness } from '../../floorplan/planGeometry'
import { pointInRoom } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { derivePlumbingPoints } from '../../furniture/mepSuggest'
import type { FurnitureItem } from '../../furniture/types'
import {
  DRAIN_STUB_DIA_M,
  FIXTURE_SNAP_M,
  FLOOR_TRAP_CLEAR_M,
  FLOOR_TRAP_SIZE_M,
  FLOOR_TRAP_Y,
  floorObstacles,
  HEATER_BOX,
  plumbingForRoom,
  resolvePlumbingFittings,
  SOIL_PIPE_DIA_M,
  TAP_DEPTH_M,
  TAP_PIPE_CLEAR_M,
  wetRoomTraps,
} from './plumbingModel'
import { rightNormal } from './wallSnap'

const plan = buildDefaultPlan()
const items = defaultLayout().map(
  (e) => ({ ...e, rotation: e.rotation ?? 0, props: e.props ?? {} }) as FurnitureItem,
)
const derived = derivePlumbingPoints(items, BUILTIN_CATALOG)
const obstacles = floorObstacles(items, BUILTIN_CATALOG)
const fittings = resolvePlumbingFittings(
  plan,
  [...derived, ...wetRoomTraps(plan, derived, obstacles)],
  obstacles,
)

/** Perpendicular distance from a point to a wall's centreline segment. */
function distToWall(x: number, z: number, wallId: string): number {
  const w = plan.walls.find((ww) => ww.id === wallId)!
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz)
  const t = Math.max(0, Math.min(1, ((x - w.start[0]) * dx + (z - w.start[1]) * dz) / (len * len)))
  return Math.hypot(x - (w.start[0] + t * dx), z - (w.start[1] + t * dz))
}

function depthFor(kind: string): number {
  if (kind === 'water-point') return TAP_DEPTH_M
  if (kind === 'drainage') return DRAIN_STUB_DIA_M
  if (kind === 'soil-pipe') return SOIL_PIPE_DIA_M
  return HEATER_BOX.d
}

describe('resolvePlumbingFittings on the default flat', () => {
  it('gives both bathrooms and the service yard at least one floor trap each', () => {
    for (const roomId of ['bath1', 'bath2', 'serviceYard']) {
      const traps = fittings.filter((f) => f.kind === 'floor-trap' && f.roomId === roomId)
      expect(traps.length, roomId).toBeGreaterThanOrEqual(1)
    }
  })

  it('every floor trap sits on the floor, inside a room, clear of every wall centreline', () => {
    const traps = fittings.filter((f) => f.kind === 'floor-trap')
    expect(traps.length).toBeGreaterThanOrEqual(3)
    for (const t of traps) {
      expect(t.y).toBeCloseTo(FLOOR_TRAP_Y, 6)
      expect(t.yaw).toBe(0)
      expect(t.wallId).toBeNull()
      expect(plan.rooms.some((r) => pointInRoom(r, t.x, t.z))).toBe(true)
      for (const w of plan.walls)
        expect(distToWall(t.x, t.z, w.id)).toBeGreaterThanOrEqual(FLOOR_TRAP_CLEAR_M - 1e-9)
    }
  })

  it('never leaves a floor trap under a fixture footprint (a shower tray hides it)', () => {
    const traps = fittings.filter((f) => f.kind === 'floor-trap')
    for (const t of traps)
      for (const o of obstacles) {
        const c = Math.cos(o.rotation ?? 0)
        const s = Math.sin(o.rotation ?? 0)
        const dx = t.x - o.x
        const dz = t.z - o.z
        const lx = dx * c + dz * s
        const lz = -dx * s + dz * c
        const inside =
          Math.abs(lx) < o.w / 2 + FLOOR_TRAP_SIZE_M / 2 &&
          Math.abs(lz) < o.d / 2 + FLOOR_TRAP_SIZE_M / 2
        expect(inside, `${t.x.toFixed(2)},${t.z.toFixed(2)} inside a footprint`).toBe(false)
      }
  })

  it('steps a bib tap aside when its own fixture also puts a soil stack on that wall', () => {
    const pipes = fittings.filter((f) => f.kind === 'soil-pipe')
    const taps = fittings.filter((f) => f.kind === 'water-point')
    expect(pipes.length).toBeGreaterThan(0)
    for (const pipe of pipes)
      for (const tap of taps) {
        if (tap.wallId !== pipe.wallId) continue
        expect(Math.hypot(tap.x - pipe.x, tap.z - pipe.z)).toBeGreaterThan(SOIL_PIPE_DIA_M)
      }
    expect(TAP_PIPE_CLEAR_M).toBeGreaterThan(SOIL_PIPE_DIA_M * 2)
  })

  it('every wall item stands proud of its host wall face by half its depth', () => {
    const wallItems = fittings.filter((f) => f.wallId !== null)
    expect(wallItems.length).toBeGreaterThan(3)
    for (const f of wallItems) {
      const w = plan.walls.find((ww) => ww.id === f.wallId)!
      const expected = planWallThickness(w, plan) / 2 + depthFor(f.kind) / 2
      expect(distToWall(f.x, f.z, f.wallId!)).toBeCloseTo(expected, 3)
    }
  })

  it('wall items face away from their wall (+Z of the yaw points along the outward normal)', () => {
    for (const f of fittings) {
      if (f.wallId === null) continue
      const w = plan.walls.find((ww) => ww.id === f.wallId)!
      const [nx, nz] = rightNormal(w)
      const dirX = Math.sin(f.yaw)
      const dirZ = Math.cos(f.yaw)
      expect(Math.abs(dirX * nx + dirZ * nz)).toBeCloseTo(1, 5)
      const before = distToWall(f.x, f.z, f.wallId!)
      const after = distToWall(f.x + dirX * 0.05, f.z + dirZ * 0.05, f.wallId!)
      expect(after).toBeGreaterThan(before)
    }
  })

  it('uses the MEP layer mount heights: bib taps 0.6 m, heaters 1.8 m, waste at floor', () => {
    for (const f of fittings) {
      if (f.kind === 'water-point') expect(f.y).toBeCloseTo(0.6, 6)
      if (f.kind === 'water-heater') expect(f.y).toBeCloseTo(1.8, 6)
      if (f.kind === 'drainage' || f.kind === 'soil-pipe') expect(f.y).toBeCloseTo(0, 6)
    }
  })

  it('honours a persisted mount height and skips upper-storey points', () => {
    const r = resolvePlumbingFittings(plan, [
      { x: 2.32, z: 5.42, kind: 'water-point', mountHeightMm: 1100 },
      { x: 2.32, z: 5.5, kind: 'water-point', levelId: 'up' },
      { x: 2.12, z: 5.42, kind: 'floor-trap', levelId: 'up' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].y).toBeCloseTo(1.1, 6)
  })

  it("falls back to a wider reach for a WC's soil pipe, but still drops a mid-room water heater", () => {
    expect(FIXTURE_SNAP_M).toBeGreaterThan(0.6)
    const mid = resolvePlumbingFittings(plan, [
      { x: 10.9, z: 4.0, kind: 'water-heater' },
      { x: 10.9, z: 4.0, kind: 'drainage' },
    ])
    // (10.9, 4.0) is mid-living-room, far from every wall.
    expect(mid).toHaveLength(0)
  })

  it('drops a floor trap that is not inside any room', () => {
    expect(resolvePlumbingFittings(plan, [{ x: -5, z: -5, kind: 'floor-trap' }])).toHaveLength(0)
  })
})

describe('wetRoomTraps — every wet room gets a trap, furnished or not', () => {
  const traps = wetRoomTraps(plan, derived, obstacles)
  it('adds one only where the derived layout left the room without a trap', () => {
    // bath1 (shower) and the service yard (washer) already have one from the fixtures.
    expect(traps.every((t) => t.kind === 'floor-trap')).toBe(true)
    const rooms = traps.map((t) => plan.rooms.find((r) => pointInRoom(r, t.x, t.z))?.id)
    expect(rooms).toContain('bath2')
    expect(rooms).toContain('kitchen')
    expect(rooms).not.toContain('bath1')
    expect(rooms).not.toContain('serviceYard')
    expect(rooms).not.toContain('livingDining')
  })
})

describe('plumbingForRoom — scoping to the room editor’s one isolated room', () => {
  const bath1 = plumbingForRoom(fittings, plan, 'bath1')
  it('returns only bath1 items', () => {
    expect(bath1.length).toBeGreaterThan(0)
    expect(bath1.length).toBeLessThan(fittings.length)
    for (const f of bath1) expect(f.roomId).toBe('bath1')
  })
  it('an unknown room id yields an empty list rather than the whole flat', () => {
    expect(plumbingForRoom(fittings, plan, 'not-a-real-room')).toEqual([])
  })
})
