import { describe, expect, it } from 'vitest'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { planCollisionWalls } from '../../floorplan/planGeometry'
import type { FloorPlan } from '../../floorplan/types'
import { defaultLayout } from '../../furniture/defaultLayout'
import type { FurnitureItem } from '../../furniture/types'
import { fixtureLightsFor, mergeFixtureLights } from './fixtureLights'
import {
  aggregateGain,
  LIGHT_POOL_MAX,
  LIGHT_POOL_SIZE,
  lightRoomIds,
  type PoolEntry,
  poolSelection,
  ROOM_EXIT_HYSTERESIS_M,
  roomAtCamera,
  roomEntryId,
  roomLinks,
} from './lightRooms'

const plan = buildDefaultPlan()
const items = defaultLayout().map(
  (e) => ({ ...e, rotation: e.rotation ?? 0, props: e.props ?? {} }) as FurnitureItem,
)
const lights = fixtureLightsFor(items, { lightMood: 'none', iesEnabled: false })
const lightRooms = lightRoomIds(plan.rooms, lights)
const ALL_DOORS = [
  'door-main',
  'door-mainBedroom',
  'door-bedroom2',
  'door-bedroom3',
  'door-bath1',
  'door-bath2',
  'door-householdShelter',
  'door-serviceYard',
]
const doorsOpen = Object.fromEntries(ALL_DOORS.map((id) => [id, { open: true }]))
const shippedLinks = roomLinks(plan.rooms, buildCollisionWalls({}))
const openLinks = roomLinks(plan.rooms, buildCollisionWalls(doorsOpen))
const linked = (links: ReturnType<typeof roomLinks>, a: string) =>
  [...(links.get(a)?.keys() ?? [])].sort()
const roomOfPool = (ids: string[]) => ids.map((id) => lightRooms.get(id))

describe('ROOM-SCOPED-LIGHTS — pool size', () => {
  it('is 8, and never past the 12 the cost ladder supports', () => {
    expect(LIGHT_POOL_SIZE).toBe(8)
    expect(LIGHT_POOL_SIZE).toBeLessThanOrEqual(LIGHT_POOL_MAX)
    expect(LIGHT_POOL_MAX).toBe(12)
  })
})

describe('lightRoomIds — the default flat', () => {
  it('puts all 19 fixtures in the room their bulb is in', () => {
    expect(lights).toHaveLength(19)
    const count = new Map<string, number>()
    for (const l of lights) {
      const r = lightRooms.get(l.id)
      expect(r).toBeTruthy()
      count.set(r as string, (count.get(r as string) ?? 0) + 1)
    }
    expect(Object.fromEntries(count)).toEqual({
      mainBedroom: 6,
      bedroom2: 2,
      bedroom3: 1,
      livingDining: 4,
      kitchen: 1,
      bath1: 1,
      bath2: 1,
      corridor: 1,
      householdShelter: 1,
      serviceYard: 1,
    })
  })

  it('gives a bulb outside every room to the nearest room', () => {
    const m = lightRoomIds(plan.rooms, [{ id: 'balcony', position: [12.9, 1, 4] }])
    expect(m.get('balcony')).toBe('livingDining')
  })
})

describe('roomLinks — which rooms see each other', () => {
  it('links the wall-less boundaries of the shipped flat (corridor, living, open kitchen)', () => {
    expect(linked(shippedLinks, 'livingDining')).toEqual(['corridor', 'kitchen'])
    expect(linked(shippedLinks, 'corridor')).toEqual(['livingDining'])
  })

  it('treats a closed door as a wall and an open one as a gap', () => {
    // Every interior door ships closed except the service yard's (an HDB's honest daily state).
    expect(linked(shippedLinks, 'mainBedroom')).toEqual([])
    expect(linked(shippedLinks, 'kitchen')).toEqual(['livingDining', 'serviceYard'])
    expect(linked(openLinks, 'mainBedroom')).toEqual(['bath1', 'corridor'])
    expect(linked(openLinks, 'corridor')).toEqual([
      'bath2',
      'bedroom2',
      'bedroom3',
      'householdShelter',
      'livingDining',
      'mainBedroom',
    ])
  })

  it('is symmetric', () => {
    for (const [a, m] of openLinks)
      for (const b of m.keys()) expect(openLinks.get(b)?.has(a)).toBe(true)
  })

  it('works on a custom plan through planCollisionWalls', () => {
    const custom: FloorPlan = {
      ...plan,
      id: 'custom',
      rooms: [
        { ...plan.rooms[0], id: 'a', origin: [0, 0], width: 3, depth: 3, extension: undefined },
        { ...plan.rooms[0], id: 'b', origin: [3, 0], width: 3, depth: 3, extension: undefined },
        { ...plan.rooms[0], id: 'c', origin: [6.1, 0], width: 3, depth: 3, extension: undefined },
      ],
      walls: [{ ...plan.walls[0], id: 'w-bc', start: [6.05, 0], end: [6.05, 3] }],
      openings: [],
    }
    const links = roomLinks(custom.rooms, planCollisionWalls(custom, {}))
    expect(linked(links, 'a')).toEqual(['b'])
    expect(linked(links, 'b')).toEqual(['a'])
    expect(linked(links, 'c')).toEqual([])
  })
})

describe('poolSelection — camera room, then what is visible from it', () => {
  const ids = (sel: PoolEntry[]) => sel.map((e) => e.id)

  it('shipped doors: every walk room fits in 8, one slot per lamp', () => {
    const demand: Record<string, number> = {}
    for (const r of plan.rooms) {
      const sel = poolSelection(lights, lightRooms, shippedLinks, r.id)
      expect(sel.every((e) => e.members.length === 1)).toBe(true)
      demand[r.id] = sel.length
    }
    // Living/kitchen/corridor share one open space (+ the service yard through its open door).
    expect(demand.livingDining).toBe(7)
    expect(demand.kitchen).toBe(7)
    expect(demand.corridor).toBe(7)
    expect(demand.mainBedroom).toBe(6)
    expect(Math.max(...Object.values(demand))).toBeLessThanOrEqual(LIGHT_POOL_SIZE)
  })

  it('the living room: its own 4 first, then what is seen through the open boundaries', () => {
    const sel = poolSelection(lights, lightRooms, shippedLinks, 'livingDining')
    expect(roomOfPool(ids(sel))).toEqual([
      'livingDining',
      'livingDining',
      'livingDining',
      'livingDining',
      'kitchen',
      'corridor',
      'serviceYard',
    ])
    // A bedroom behind its closed door lights nothing here — no more light through the wall.
    expect(roomOfPool(ids(sel))).not.toContain('bedroom3')
  })

  it('the main bedroom with every door open fills the pool exactly: 6 + its bath + the corridor', () => {
    const sel = ids(poolSelection(lights, lightRooms, openLinks, 'mainBedroom'))
    expect(sel).toHaveLength(8)
    expect(roomOfPool(sel).slice(0, 6)).toEqual(Array(6).fill('mainBedroom'))
    expect(new Set(roomOfPool(sel).slice(6))).toEqual(new Set(['bath1', 'corridor']))
  })

  it('the corridor with every door open: over-subscribed, so every visible room still gets light', () => {
    const sel = poolSelection(lights, lightRooms, openLinks, 'corridor')
    expect(sel).toHaveLength(LIGHT_POOL_SIZE)
    expect(sel[0].id).toBe('default-corr-light')
    // 15 lamps in 6 visible rooms: each room is represented, the big ones merged to one slot.
    const roomsLit = new Set(sel.flatMap((e) => e.members.map((m) => lightRooms.get(m))))
    expect(roomsLit).toEqual(
      new Set([
        'corridor',
        'livingDining',
        'mainBedroom',
        'bedroom2',
        'bedroom3',
        'bath2',
        'householdShelter',
      ]),
    )
    const mb = sel.find((e) => e.id === roomEntryId('mainBedroom'))
    expect(mb?.members).toHaveLength(6)
    expect(sel.find((e) => e.id === roomEntryId('livingDining'))?.members).toHaveLength(4)
    // Every lamp in the corridor's view is carried by exactly one entry.
    expect(sel.reduce((a, e) => a + e.members.length, 0)).toBe(16)
    // Deterministic: the same inputs give the same pool.
    expect(poolSelection(lights, lightRooms, openLinks, 'corridor')).toEqual(sel)
  })

  it('spends spare slots un-merging rooms, and never passes the 12-light cap', () => {
    const sel = poolSelection(lights, lightRooms, openLinks, 'corridor', 40)
    expect(sel.length).toBeLessThanOrEqual(LIGHT_POOL_MAX)
    expect(sel.find((e) => e.id === roomEntryId('livingDining'))).toBeUndefined()
    // Ring 1 (15 lamps) served in 11 slots; the 12th reaches the kitchen through the living room.
    expect(sel).toHaveLength(12)
    expect(sel.reduce((a, e) => a + e.members.length, 0)).toBe(17)
  })

  it('with no rooms at all, falls back to the first 8 in stable item order', () => {
    expect(ids(poolSelection(lights, lightRooms, shippedLinks, null))).toEqual(
      lights.slice(0, 8).map((l) => l.id),
    )
  })
})

describe('aggregateGain — a merged room lights its walls as brightly as its lamps did', () => {
  const lit = (l: (typeof lights)[number]) => ({
    position: l.position,
    intensity: l.baseIntensity * l.moodMultiplier,
    distance: l.distance,
  })
  const mbRoom = plan.rooms.find((r) => r.id === 'mainBedroom')
  const mb = lights.filter((l) => lightRooms.get(l.id) === 'mainBedroom')
  const merged = mergeFixtureLights(mb)

  it('lifts the plain sum for the main bedroom (six lamps, four of them on walls)', () => {
    if (!mbRoom) throw new Error('no main bedroom')
    const g = aggregateGain(mbRoom, mb.map(lit), lit(merged))
    expect(g).toBeGreaterThan(1.1)
    expect(g).toBeLessThanOrEqual(4)
  })

  it('is 1 for a single lamp standing in for itself', () => {
    const one = lights.find((l) => l.id === 'default-corr-light')
    const corridor = plan.rooms.find((r) => r.id === 'corridor')
    if (!one || !corridor) throw new Error('fixture missing')
    expect(aggregateGain(corridor, [lit(one)], lit(one))).toBeCloseTo(1, 6)
  })
})

describe('roomAtCamera — room with hysteresis', () => {
  it('finds the room the camera is in', () => {
    expect(roomAtCamera(plan.rooms, 11, 7, null)).toBe('livingDining')
    expect(roomAtCamera(plan.rooms, 1.9, 3.4, null)).toBe('mainBedroom')
  })

  it('does not flip on a wall-less boundary until the camera is clearly past it', () => {
    // Corridor ends and the living room begins at x = 9.125 (z 3.825–4.825), with no wall.
    const z = 4.3
    expect(roomAtCamera(plan.rooms, 9.0, z, null)).toBe('corridor')
    expect(roomAtCamera(plan.rooms, 9.2, z, 'corridor')).toBe('corridor')
    expect(roomAtCamera(plan.rooms, 9.125 + ROOM_EXIT_HYSTERESIS_M - 0.01, z, 'corridor')).toBe(
      'corridor',
    )
    expect(roomAtCamera(plan.rooms, 9.125 + ROOM_EXIT_HYSTERESIS_M + 0.05, z, 'corridor')).toBe(
      'livingDining',
    )
    // …and the same margin on the way back.
    expect(roomAtCamera(plan.rooms, 9.0, z, 'livingDining')).toBe('livingDining')
    expect(roomAtCamera(plan.rooms, 8.7, z, 'livingDining')).toBe('corridor')
  })

  it('keeps the current room while standing in a doorway that belongs to neither', () => {
    // door-bedroom2's wall thickness, between the corridor (z ≥ 3.825) and bedroom 2 (z ≤ 3.725).
    expect(roomAtCamera(plan.rooms, 5.39, 3.775, 'bedroom2')).toBe('bedroom2')
  })

  it('takes the nearest room when it starts outside every room', () => {
    expect(roomAtCamera(plan.rooms, 13.2, 4, null)).toBe('livingDining')
  })
})
