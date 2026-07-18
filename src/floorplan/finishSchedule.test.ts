import { describe, expect, it } from 'vitest'
import { AREA_CAVEAT, buildFinishSchedule, DEFAULT_CEILING, NEUTRAL_WALL } from './finishSchedule'
import type { RoomFinishMaps } from './roomFinishes'
import type { FloorPlan, PlanOpening, PlanRoom, PlanUpperLevel, PlanWall } from './types'

const room = (id: string, name: string, over: Partial<PlanRoom> = {}): PlanRoom => ({
  id,
  name,
  origin: [0, 0],
  width: 3,
  depth: 3,
  ...over,
})

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  over: Partial<PlanWall> = {},
): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
  ...over,
})

const plan = (
  rooms: PlanRoom[],
  over: Partial<FloorPlan> = {},
  upperLevels?: PlanUpperLevel[],
): FloorPlan =>
  ({
    id: 'p',
    name: 'P',
    ceilingHeight: 2.6,
    extent: [9, 9],
    walls: [],
    openings: [],
    rooms,
    ...over,
    ...(upperLevels ? { upperLevels } : {}),
  }) as FloorPlan

const nameOf = (id: string) =>
  ({ 'floor-wood-oak': 'Oak', 'wall-paint-white': 'White paint' })[id] ?? id

const noFinishes: RoomFinishMaps = { floor: {}, walls: {} }

describe('buildFinishSchedule', () => {
  it('reads the live finishes slice over plan/app defaults, with stable codes', () => {
    const { rows } = buildFinishSchedule(
      plan([room('living', 'Living')]),
      {
        floor: { living: 'floor-wood-oak' },
        walls: { living: 'wall-paint-white' },
      } as RoomFinishMaps,
      nameOf,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.room).toBe('Living')
    expect(rows[0]!.floor).toMatchObject({ code: 'FL-01', name: 'Oak' })
    expect(rows[0]!.wall).toMatchObject({ code: 'WL-01', name: 'White paint' })
    expect(rows[0]!.ceiling).toMatchObject({ code: 'CL-01', name: DEFAULT_CEILING })
  })

  it('falls back to the room finish, then the app default floor + neutral wall', () => {
    const { rows } = buildFinishSchedule(
      plan([room('bed', 'Bedroom', { floor: 'floor-wood-oak' }), room('bare', 'Bare')]),
      noFinishes,
      nameOf,
    )
    expect(rows[0]!.floor.name).toBe('Oak')
    expect(rows[0]!.wall.name).toBe(NEUTRAL_WALL)
    expect(rows[1]!.room).toBe('Bare')
    expect(rows[1]!.wall.name).toBe(NEUTRAL_WALL)
  })

  it('lists rooms across storeys (ground first)', () => {
    const upper: PlanUpperLevel = {
      id: 'lvl-2',
      name: 'Upper',
      elevation: 3,
      walls: [],
      openings: [],
      rooms: [room('loft', 'Loft')],
    }
    const { rows } = buildFinishSchedule(
      plan([room('g', 'Ground room')], {}, [upper]),
      noFinishes,
      nameOf,
    )
    expect(rows.map((r) => r.room)).toEqual(['Ground room', 'Loft'])
  })

  it('is empty for a plan with no rooms', () => {
    const sched = buildFinishSchedule(plan([]), noFinishes, nameOf)
    expect(sched.rows).toEqual([])
    expect(sched.accentWalls).toEqual([])
    expect(sched.totals).toEqual([])
    expect(sched.caveat).toBe(AREA_CAVEAT)
  })

  it('computes floor area, wall area NET of a door + a window, and ceiling area', () => {
    // A 4x3 room (perimeter 14m, ceiling 2.5m -> gross wall 35m2) with one
    // 0.9m x 2.0m door (1.8m2) and one 1.2m x 1.2m window (1.44m2) on its walls.
    const r = room('r1', 'Room', { origin: [0, 0], width: 4, depth: 3 })
    const w1: PlanWall = wall('w1', [0, 0], [4, 0]) // north wall, length 4
    const w2: PlanWall = wall('w2', [4, 0], [4, 3]) // east wall, length 3
    const door: PlanOpening = {
      id: 'd1',
      kind: 'door',
      wallId: 'w1',
      offset: 1,
      width: 0.9,
      sill: 0,
      head: 2.0,
    }
    const win: PlanOpening = {
      id: 'w1o',
      kind: 'window',
      wallId: 'w2',
      offset: 1,
      width: 1.2,
      sill: 1.0,
      head: 2.2,
    }
    const p = plan([r], { ceilingHeight: 2.5, walls: [w1, w2], openings: [door, win] })
    const { rows } = buildFinishSchedule(p, noFinishes, nameOf)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.floor.area).toBeCloseTo(12, 5) // 4 x 3
    expect(rows[0]!.ceiling.area).toBeCloseTo(12, 5)
    // gross = perimeter(14) * height(2.5) = 35; deduct door(1.8) + window(1.44) = 3.24
    expect(rows[0]!.wall.area).toBeCloseTo(35 - 1.8 - 1.44, 5)
  })

  it("clamps an opening's head/sill to the room ceiling — a head typed above the ceiling cannot over-deduct (bug-hunt 2026-07-18 #2)", () => {
    const r = room('r1', 'Room', { origin: [0, 0], width: 4, depth: 3 })
    const w1: PlanWall = wall('w1', [0, 0], [4, 0])
    // head 25m (typo for 2.5?) on a 2.5m ceiling: deduction must clamp to
    // 0.9 x (2.5 - 0) = 2.25, not 0.9 x 25 = 22.5 (which would zero the room).
    const door: PlanOpening = {
      id: 'd1',
      kind: 'door',
      wallId: 'w1',
      offset: 1,
      width: 0.9,
      sill: 0,
      head: 25,
    }
    const p = plan([r], { ceilingHeight: 2.5, walls: [w1], openings: [door] })
    const { rows } = buildFinishSchedule(p, noFinishes, nameOf)
    expect(rows[0]!.wall.area).toBeCloseTo(35 - 0.9 * 2.5, 5)
    // A sill also above the ceiling degenerates to zero deduction, not negative.
    const highSill = { ...door, sill: 26, head: 27 }
    const p2 = plan([r], { ceilingHeight: 2.5, walls: [w1], openings: [highSill] })
    expect(buildFinishSchedule(p2, noFinishes, nameOf).rows[0]!.wall.area).toBeCloseTo(35, 5)
  })

  it('flags a non-flat ceiling with a verify-on-site note (area still the flat footprint)', () => {
    const r = room('r1', 'Room', { ceiling: { style: 'tray', drop: 0.1 } })
    const { rows } = buildFinishSchedule(plan([r]), noFinishes, nameOf)
    expect(rows[0]!.ceiling.note).toMatch(/tray/i)
    expect(rows[0]!.ceiling.note).toMatch(/verify on site/i)
  })

  it('lists accent walls (PlanWall.color) as separate callout rows with stable AW codes', () => {
    const r = room('r1', 'Room', { origin: [0, 0], width: 4, depth: 3 })
    const accent: PlanWall = wall('acc', [0, 0], [4, 0], { color: '#ff0000' })
    const plain: PlanWall = wall('plain', [4, 0], [4, 3])
    const p = plan([r], { walls: [accent, plain] })
    const { accentWalls } = buildFinishSchedule(p, noFinishes, nameOf)
    expect(accentWalls).toHaveLength(1)
    expect(accentWalls[0]).toMatchObject({ wallId: 'acc', code: 'AW-01', color: '#ff0000' })
    expect(accentWalls[0]!.orientation).toBe('E–W run')
    expect(accentWalls[0]!.rooms).toEqual(['Room'])
    expect(accentWalls[0]!.area).toBeGreaterThan(0)
  })

  it('assigns the same colour the same AW code, and a new colour a new one, without renumbering', () => {
    const r = room('r1', 'Room', { origin: [0, 0], width: 4, depth: 3 })
    const a1: PlanWall = wall('a1', [0, 0], [4, 0], { color: '#ff0000' })
    const a2: PlanWall = wall('a2', [4, 0], [4, 3], { color: '#00ff00' })
    const a3: PlanWall = wall('a3', [4, 3], [0, 3], { color: '#ff0000' })
    const p = plan([r], { walls: [a1, a2, a3] })
    const { accentWalls } = buildFinishSchedule(p, noFinishes, nameOf)
    const byId = Object.fromEntries(accentWalls.map((a) => [a.wallId, a.code]))
    expect(byId['a1']).toBe('AW-01')
    expect(byId['a2']).toBe('AW-02')
    expect(byId['a3']).toBe('AW-01')
  })

  it('code assignment is stable: adding a new room/finish appends rather than renumbers', () => {
    const before = buildFinishSchedule(
      plan([
        room('a', 'A', { floor: 'floor-wood-oak' }),
        room('b', 'B', { floor: 'wall-paint-white' }),
      ]),
      noFinishes,
      nameOf,
    )
    const after = buildFinishSchedule(
      plan([
        room('a', 'A', { floor: 'floor-wood-oak' }),
        room('b', 'B', { floor: 'wall-paint-white' }),
        room('c', 'C', { floor: 'floor-marble' }),
      ]),
      noFinishes,
      nameOf,
    )
    expect(after.rows[0]!.floor.code).toBe(before.rows[0]!.floor.code)
    expect(after.rows[1]!.floor.code).toBe(before.rows[1]!.floor.code)
    expect(after.rows[2]!.floor.code).toBe('FL-03')
  })

  it('aggregates totals per material code across rooms', () => {
    const p = plan([
      room('a', 'A', { origin: [0, 0], width: 2, depth: 2, floor: 'floor-wood-oak' }),
      room('b', 'B', { origin: [3, 0], width: 2, depth: 2, floor: 'floor-wood-oak' }),
    ])
    const { totals } = buildFinishSchedule(p, noFinishes, nameOf)
    const floorTotal = totals.find((t) => t.kind === 'floor' && t.code === 'FL-01')
    expect(floorTotal).toBeTruthy()
    expect(floorTotal!.area).toBeCloseTo(4 + 4, 5)
    // Wall + ceiling totals also present (neutral wall / default ceiling share one code).
    expect(totals.some((t) => t.kind === 'wall')).toBe(true)
    expect(totals.some((t) => t.kind === 'ceiling')).toBe(true)
  })
})
