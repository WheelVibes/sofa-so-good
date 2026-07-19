import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom, PlanWall } from '../floorplan/types'
import { buildPlanStatistics, isCirculationRoom, roomKindLabel } from './planStatistics'

/** Axis-aligned rectangular room: area = w·d, perimeter = 2·(w+d). */
const room = (
  id: string,
  name: string,
  w: number,
  d: number,
  origin: [number, number] = [0, 0],
): PlanRoom => ({
  id,
  name,
  origin,
  width: w,
  depth: d,
})

/** A straight wall from (x0,z0) to (x1,z1); length = hypot. */
const wall = (id: string, x0: number, z0: number, x1: number, z1: number): PlanWall => ({
  id,
  start: [x0, z0],
  end: [x1, z1],
  thickness: 'internal',
})

const plan = (rooms: PlanRoom[], walls: PlanWall[] = []): FloorPlan => ({
  id: 'p',
  name: 'Test plan',
  ceilingHeight: 2.8,
  extent: [10, 10],
  walls,
  openings: [],
  rooms,
})

describe('buildPlanStatistics — known fixture exact totals', () => {
  it('sums area, perimeter, wall length and averages for a simple two-room plan', () => {
    const rooms = [
      room('living', 'Living Room', 4, 3), // area 12, perimeter 14
      room('bed', 'Master Bedroom', 3, 2), // area 6, perimeter 10
    ]
    const walls = [
      wall('w1', 0, 0, 4, 0), // 4 m
      wall('w2', 0, 0, 0, 3), // 3 m
    ]
    const s = buildPlanStatistics(plan(rooms, walls))
    expect(s.totalAreaSqm).toBeCloseTo(18, 6)
    expect(s.roomCount).toBe(2)
    expect(s.levelCount).toBe(1)
    expect(s.averageRoomSqm).toBeCloseTo(9, 6)
    expect(s.totalPerimeterM).toBeCloseTo(24, 6)
    expect(s.totalWallLengthM).toBeCloseTo(7, 6)
    // No circulation rooms → all net.
    expect(s.circulationSqm).toBe(0)
    expect(s.netAreaSqm).toBeCloseTo(18, 6)
    expect(s.circulationFraction).toBe(0)
  })

  it('groups rooms by kind, sorted by descending area', () => {
    const rooms = [
      room('living', 'Living', 5, 4), // living 20
      room('b1', 'Bedroom 1', 3, 3), // bedroom 9
      room('b2', 'Bedroom 2', 3, 2), // bedroom 6  → bedroom total 15
      room('k', 'Kitchen', 2, 2), // kitchen 4
    ]
    const s = buildPlanStatistics(plan(rooms))
    expect(s.byKind.map((k) => k.kind)).toEqual(['living', 'bedroom', 'kitchen'])
    const bedroom = s.byKind.find((k) => k.kind === 'bedroom')!
    expect(bedroom.count).toBe(2)
    expect(bedroom.areaSqm).toBeCloseTo(15, 6)
    const living = s.byKind.find((k) => k.kind === 'living')!
    expect(living.count).toBe(1)
    expect(living.areaSqm).toBeCloseTo(20, 6)
  })
})

describe('buildPlanStatistics — edge cases', () => {
  it('returns a fully-zeroed digest for an empty plan (no NaN/undefined)', () => {
    const s = buildPlanStatistics(plan([]))
    expect(s.totalAreaSqm).toBe(0)
    expect(s.roomCount).toBe(0)
    expect(s.byKind).toEqual([])
    expect(s.averageRoomSqm).toBe(0)
    expect(s.totalPerimeterM).toBe(0)
    expect(s.totalWallLengthM).toBe(0)
    expect(s.circulationSqm).toBe(0)
    expect(s.netAreaSqm).toBe(0)
    expect(s.circulationFraction).toBe(0)
    expect(s.levelCount).toBe(1)
    // Nothing is NaN.
    for (const v of Object.values(s)) {
      if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('still counts wall length on a bare shell with walls but no rooms', () => {
    const s = buildPlanStatistics(plan([], [wall('w', 0, 0, 3, 4)])) // length 5
    expect(s.roomCount).toBe(0)
    expect(s.totalAreaSqm).toBe(0)
    expect(s.totalWallLengthM).toBeCloseTo(5, 6)
  })

  it('honours an explicit room category over the name (RM1)', () => {
    // "Ella's room" infers to 'other'; an explicit bedroom category wins and
    // tallies it under bedroom. A name-only room stays byte-identical.
    const rooms = [
      { ...room('kr', "Ella's room", 3, 3), category: 'bedroom' as const }, // → bedroom 9
      room('lr', 'Living', 4, 3), // → living 12
    ]
    const s = buildPlanStatistics(plan(rooms))
    expect(s.byKind.map((k) => k.kind).sort()).toEqual(['bedroom', 'living'])
    expect(s.byKind.find((k) => k.kind === 'bedroom')!.count).toBe(1)
  })

  it('buckets rooms with no recognisable kind as "other"', () => {
    const rooms = [
      room('x', 'Zone Q', 2, 2), // unknown → other
      room('y', 'Flex Space', 3, 1), // unknown → other
    ]
    const s = buildPlanStatistics(plan(rooms))
    expect(s.byKind).toHaveLength(1)
    expect(s.byKind[0].kind).toBe('other')
    expect(s.byKind[0].count).toBe(2)
    expect(s.byKind[0].areaSqm).toBeCloseTo(7, 6)
  })
})

describe('buildPlanStatistics — multi-storey aggregation', () => {
  it('sums area, perimeter and wall length across ground + upper storeys', () => {
    const ground = plan(
      [room('living', 'Living', 4, 3)], // 12
      [wall('g', 0, 0, 4, 0)], // 4
    )
    const multi: FloorPlan = {
      ...ground,
      upperLevels: [
        {
          id: 'L1',
          name: 'Level 2',
          elevation: 3,
          walls: [wall('u', 0, 0, 0, 3)], // 3
          openings: [],
          rooms: [room('bed2', 'Bedroom', 3, 2, [0, 0])], // 6
        },
      ],
    }
    const s = buildPlanStatistics(multi)
    expect(s.levelCount).toBe(2)
    expect(s.roomCount).toBe(2)
    expect(s.totalAreaSqm).toBeCloseTo(18, 6)
    expect(s.totalWallLengthM).toBeCloseTo(7, 6)
    expect(s.byKind.map((k) => k.kind).sort()).toEqual(['bedroom', 'living'])
  })
})

describe('buildPlanStatistics — net vs circulation split', () => {
  it('isolates corridor/hallway area from net habitable area', () => {
    const rooms = [
      room('living', 'Living', 5, 4), // 20 net
      room('hall', 'Hallway', 4, 1), // 4 circulation
      room('cor', 'Corridor', 3, 1), // 3 circulation
    ]
    const s = buildPlanStatistics(plan(rooms))
    expect(s.totalAreaSqm).toBeCloseTo(27, 6)
    expect(s.circulationSqm).toBeCloseTo(7, 6)
    expect(s.netAreaSqm).toBeCloseTo(20, 6)
    expect(s.circulationFraction).toBeCloseTo(7 / 27, 6)
  })

  it('detects circulation room names but not habitable ones', () => {
    expect(isCirculationRoom({ name: 'Corridor' })).toBe(true)
    expect(isCirculationRoom({ name: 'Entrance Foyer' })).toBe(true)
    expect(isCirculationRoom({ name: 'Hallway' })).toBe(true)
    expect(isCirculationRoom({ name: 'Living Room' })).toBe(false)
    expect(isCirculationRoom({ name: 'Bedroom' })).toBe(false)
  })
})

describe('roomKindLabel', () => {
  it('maps every kind to a friendly label', () => {
    expect(roomKindLabel('living')).toBe('Living')
    expect(roomKindLabel('bath')).toBe('Bathroom')
    expect(roomKindLabel('balcony')).toBe('Balcony / service')
    expect(roomKindLabel('other')).toBe('Other')
  })
})
