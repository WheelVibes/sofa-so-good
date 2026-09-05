import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { type FloorPlan, pointInRoom, roomPolygon } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { defaultLayout } from '../../furniture/defaultLayout'
import { derivePlumbingPoints } from '../../furniture/mepSuggest'
import type { FurnitureItem } from '../../furniture/types'
import {
  floorObstacles,
  type PlumbingFitting,
  resolvePlumbingFittings,
  wetRoomTraps,
} from './plumbingModel'
import {
  DRAIN_HOSE_R,
  INLET_HOSE_R,
  RACK_MIN_CEILING_M,
  RACK_MIN_LONG_M,
  RACK_POLE_COUNT,
  RACK_POLE_SPACING_M,
  RACK_POLE_Y_M,
  RACK_WALL_CLEAR_M,
  resolveYardFittings,
  type WasherPlacement,
  yardFittingsForRoom,
  yardWashers,
} from './yardModel'

const plan = buildDefaultPlan()
const items = defaultLayout().map(
  (e) => ({ ...e, rotation: e.rotation ?? 0, props: e.props ?? {} }) as FurnitureItem,
)
const obstacles = floorObstacles(items, BUILTIN_CATALOG)
const derived = derivePlumbingPoints(items, BUILTIN_CATALOG)
const plumbing = resolvePlumbingFittings(
  plan,
  [...derived, ...wetRoomTraps(plan, derived, obstacles)],
  obstacles,
)
const washers = yardWashers(items, BUILTIN_CATALOG)
const set = resolveYardFittings(plan, plumbing, washers)

const yardTap = plumbing.find((f) => f.kind === 'water-point' && f.roomId === 'serviceYard')!
const yardTrap = plumbing.find((f) => f.kind === 'floor-trap' && f.roomId === 'serviceYard')!

describe('yardWashers — the machine geometry the hoses hang off', () => {
  it('finds the default flat’s one service-yard washer with its catalog footprint', () => {
    expect(washers).toHaveLength(1)
    const [m] = washers
    expect(m.w).toBeCloseTo(0.6, 6)
    expect(m.d).toBeCloseTo(0.6, 6)
    expect(m.h).toBeCloseTo(0.85, 6)
    expect(pointInRoom(plan.rooms.find((r) => r.id === 'serviceYard')!, m.x, m.z)).toBe(true)
  })

  it('skips upper-storey items and unknown defIds', () => {
    const up = yardWashers(
      [
        {
          id: 'a',
          defId: 'washing-machine',
          position: [1, 1],
          rotation: 0,
          props: {},
          levelId: 'l2',
        },
        { id: 'b', defId: 'not-a-washer', position: [1, 1], rotation: 0, props: {} },
      ] as FurnitureItem[],
      BUILTIN_CATALOG,
    )
    expect(up).toEqual([])
  })
})

describe('hoses on the default flat', () => {
  it('emits exactly one inlet and one drain hose, both in the service yard', () => {
    expect(set.hoses.map((h) => h.kind).sort()).toEqual(['drain', 'inlet'])
    for (const h of set.hoses) {
      expect(h.roomId).toBe('serviceYard')
      expect(h.points).toHaveLength(4)
    }
  })

  it('runs the inlet hose from the tap spout down to the machine’s top-back', () => {
    const inlet = set.hoses.find((h) => h.kind === 'inlet')!
    expect(inlet.radius).toBeCloseTo(INLET_HOSE_R, 6)
    const [start] = inlet.points
    const end = inlet.points[3]
    const [m] = washers
    // Starts at the tap (a spout's length below and in front of it).
    expect(Math.hypot(start[0] - yardTap.x, start[2] - yardTap.z)).toBeLessThan(0.05)
    expect(start[1]).toBeLessThan(yardTap.y)
    expect(start[1]).toBeGreaterThan(yardTap.y - 0.12)
    // Ends just below the machine's top face, outside its footprint on the BACK side.
    expect(end[1]).toBeGreaterThan(m.h - 0.1)
    expect(end[1]).toBeLessThan(m.h)
    const back: [number, number] = [-Math.sin(m.rotation), -Math.cos(m.rotation)]
    const alongBack = (end[0] - m.x) * back[0] + (end[2] - m.z) * back[1]
    expect(alongBack).toBeGreaterThan(m.d / 2)
    // …and the slack never sags into the machine's top face.
    for (const p of inlet.points) expect(p[1] + INLET_HOSE_R).toBeGreaterThan(m.h - 0.1)
  })

  it('honours a non-zero machine rotation (the back is local −Z, rotated)', () => {
    const m: WasherPlacement = { x: 0, z: 0, rotation: 0, w: 0.6, d: 0.6, h: 0.85 }
    const tap: PlumbingFitting = {
      kind: 'water-point',
      x: 0,
      y: 1.15,
      z: -0.35,
      yaw: 0,
      wallId: 'w',
      roomId: 'r',
    }
    const trap: PlumbingFitting = {
      kind: 'floor-trap',
      x: 0.6,
      y: 0.003,
      z: 0.2,
      yaw: 0,
      wallId: null,
      roomId: 'r',
    }
    const fake: FloorPlan = {
      ...plan,
      rooms: [{ id: 'r', name: 'Service Yard', origin: [-2, -2], width: 4, depth: 4 } as never],
    }
    const r = resolveYardFittings(fake, [tap, trap], [m])
    const inlet = r.hoses.find((h) => h.kind === 'inlet')!
    // Facing +Z with rotation 0, the back is −Z: the port must sit at negative z.
    expect(inlet.points[3][2]).toBeLessThan(-m.d / 2)
    expect(inlet.points[3][0]).toBeCloseTo(0, 6)
    const drain = r.hoses.find((h) => h.kind === 'drain')!
    // The trap is on the machine's local +X side, so the hose turns that way.
    expect(drain.points[1][0]).toBeGreaterThan(m.w / 2)
  })

  it('runs the drain hose around the machine to the near edge of the grating', () => {
    const drain = set.hoses.find((h) => h.kind === 'drain')!
    expect(drain.radius).toBeCloseTo(DRAIN_HOSE_R, 6)
    const end = drain.points[3]
    expect(end[1]).toBeCloseTo(0.003 + DRAIN_HOSE_R, 6)
    // Lands on the grating's rim, not its centre and not past it.
    const d = Math.hypot(end[0] - yardTrap.x, end[2] - yardTrap.z)
    expect(d).toBeCloseTo(0.075, 3)
    const [m] = washers
    // No point of the route sits inside the machine's own footprint.
    for (const p of drain.points) {
      const c = Math.cos(m.rotation)
      const s = Math.sin(m.rotation)
      const lx = (p[0] - m.x) * c - (p[2] - m.z) * s
      const lz = (p[0] - m.x) * s + (p[2] - m.z) * c
      expect(Math.abs(lx) > m.w / 2 || Math.abs(lz) > m.d / 2).toBe(true)
    }
  })

  it('emits nothing for a hose whose endpoint is missing', () => {
    const [m] = washers
    const noTrap = resolveYardFittings(
      plan,
      plumbing.filter((f) => f.kind !== 'floor-trap'),
      [m],
    )
    expect(noTrap.hoses.map((h) => h.kind)).toEqual(['inlet'])
    const noTap = resolveYardFittings(
      plan,
      plumbing.filter((f) => f.kind !== 'water-point'),
      [m],
    )
    expect(noTap.hoses.map((h) => h.kind)).toEqual(['drain'])
    expect(resolveYardFittings(plan, [], [m]).hoses).toEqual([])
    expect(resolveYardFittings(plan, plumbing, []).hoses).toEqual([])
  })
})

describe('ceiling laundry rack', () => {
  const yard = plan.rooms.find((r) => r.id === 'serviceYard')!
  const poly = roomPolygon(yard)
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }

  it('hangs three poles and two brackets in the service yard', () => {
    const poles = set.rack.filter((p) => p.kind === 'pole')
    const brackets = set.rack.filter((p) => p.kind === 'bracket')
    const cords = set.rack.filter((p) => p.kind === 'cord')
    expect(poles).toHaveLength(RACK_POLE_COUNT)
    expect(brackets).toHaveLength(2)
    expect(cords).toHaveLength(RACK_POLE_COUNT * 2)
    for (const p of set.rack) expect(p.roomId).toBe('serviceYard')
    for (const p of poles) expect(p.c[1]).toBeCloseTo(RACK_POLE_Y_M, 6)
    // The yard is 1.42 m across: three poles at 0.22 m spacing DO fit inside the clearance.
    expect(((RACK_POLE_COUNT - 1) * RACK_POLE_SPACING_M) / 2).toBeLessThanOrEqual(
      (bounds.maxX - bounds.minX) / 2 - RACK_WALL_CLEAR_M,
    )
  })

  it('keeps every pole (both ends) inside the yard with wall clearance', () => {
    for (const p of set.rack.filter((q) => q.kind === 'pole')) {
      const half = p.s[1] / 2
      // The yard's long axis is Z, so the pole lies along Z.
      expect(p.rot[0]).toBeCloseTo(Math.PI / 2, 6)
      for (const end of [
        [p.c[0], p.c[2] - half],
        [p.c[0], p.c[2] + half],
      ]) {
        expect(pointInRoom(yard, end[0], end[1])).toBe(true)
        expect(end[0] - bounds.minX).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
        expect(bounds.maxX - end[0]).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
        expect(end[1] - bounds.minZ).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
        expect(bounds.maxZ - end[1]).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
      }
    }
  })

  it('hangs the cords from the bracket line down to the poles, clear of the ceiling', () => {
    const ceiling = plan.ceilingHeight ?? 2.6
    for (const b of set.rack.filter((p) => p.kind === 'bracket'))
      expect(b.c[1] + b.s[1] / 2).toBeCloseTo(ceiling, 6)
    for (const c of set.rack.filter((p) => p.kind === 'cord')) {
      expect(c.c[1] - c.s[1] / 2).toBeCloseTo(RACK_POLE_Y_M, 6)
      expect(c.c[1] + c.s[1] / 2).toBeLessThanOrEqual(ceiling + 1e-9)
    }
  })

  it('is skipped for a short room or a low ceiling', () => {
    const room = { id: 'sy', name: 'Service Yard', origin: [0, 0], width: 1.2, depth: 1.4 }
    const short: FloorPlan = { ...plan, rooms: [room as never] }
    expect(RACK_MIN_LONG_M).toBeGreaterThan(1.4)
    expect(resolveYardFittings(short, [], []).rack).toEqual([])
    const tall = { ...room, width: 1.2, depth: 2.4 }
    const low: FloorPlan = { ...plan, rooms: [tall as never], ceilingHeight: 2.2 }
    expect(RACK_MIN_CEILING_M).toBeGreaterThan(2.2)
    expect(resolveYardFittings(low, [], []).rack).toEqual([])
    // Same room, a normal ceiling: a rack appears — so the two skips above are the CAUSE.
    const ok: FloorPlan = { ...plan, rooms: [tall as never], ceilingHeight: 2.6 }
    expect(resolveYardFittings(ok, [], []).rack.length).toBeGreaterThan(0)
  })

  it('drops poles rather than the clearance when the room is too narrow for three', () => {
    const narrow: FloorPlan = {
      ...plan,
      rooms: [{ id: 'sy', name: 'Service Yard', origin: [0, 0], width: 0.5, depth: 2.4 } as never],
      ceilingHeight: 2.6,
    }
    const poles = resolveYardFittings(narrow, [], []).rack.filter((p) => p.kind === 'pole')
    expect(poles.length).toBeGreaterThanOrEqual(1)
    expect(poles.length).toBeLessThan(RACK_POLE_COUNT)
    for (const p of poles) {
      expect(p.c[0]).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
      expect(0.5 - p.c[0]).toBeGreaterThanOrEqual(RACK_WALL_CLEAR_M - 1e-9)
    }
  })

  it('does not hang a rack in a room that is not a service yard', () => {
    const kitchenOnly: FloorPlan = {
      ...plan,
      rooms: plan.rooms.filter((r) => r.id !== 'serviceYard'),
    }
    expect(resolveYardFittings(kitchenOnly, [], []).rack).toEqual([])
  })
})

describe('draw budget — what the renderer has to submit', () => {
  it('is two tube draws plus three instanced rack draws for the whole flat', () => {
    expect(set.hoses).toHaveLength(2)
    // 2 brackets + 3 poles + 2 cords per pole.
    expect(set.rack).toHaveLength(2 + RACK_POLE_COUNT * 3)
    // The renderer buckets by material|geometry; these are the buckets it will build.
    const keys = new Set(set.rack.map((p) => `${p.kind === 'cord' ? 'cord' : 'alu'}|${p.geo}`))
    expect([...keys].sort()).toEqual(['alu|box', 'alu|cyl', 'cord|cyl'])
  })
})

describe('yardFittingsForRoom — the per-room editor scope (EDITOR-LOCKSTEP)', () => {
  it('keeps the yard’s own parts and nothing else', () => {
    const scoped = yardFittingsForRoom(set, 'serviceYard')
    expect(scoped.hoses).toHaveLength(set.hoses.length)
    expect(scoped.rack).toHaveLength(set.rack.length)
  })

  it('an unknown room id yields an empty set rather than the whole flat', () => {
    expect(yardFittingsForRoom(set, 'not-a-real-room')).toEqual({ hoses: [], rack: [] })
    expect(yardFittingsForRoom(set, 'kitchen')).toEqual({ hoses: [], rack: [] })
  })
})

describe('EDITOR-LOCKSTEP — mounted in both scenes, gated on the flag', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', 'scene', p), 'utf8')
  it('renders in Scene.tsx AND RoomEditorScene.tsx (the editor scoped to its room)', () => {
    expect(read('Scene.tsx')).toContain('<YardFittings />')
    expect(read('RoomEditorScene.tsx')).toContain('<YardFittings roomId={roomId} />')
  })
  it('is gated on the yardFittings flag', () => {
    expect(readFileSync(join(__dirname, 'YardFittings.tsx'), 'utf8')).toContain(
      "useFeature('yardFittings')",
    )
  })
})
