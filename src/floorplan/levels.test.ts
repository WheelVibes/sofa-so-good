import { describe, expect, it } from 'vitest'
import {
  allPlanRooms,
  cloneLevelGeometry,
  GROUND_LEVEL_ID,
  isMultiLevel,
  itemsOnLevel,
  type LevelGeometry,
  levelAsPlan,
  levelById,
  levelElevation,
  levelOfItem,
  levelOfRoom,
  levelSpawnPoint,
  planLevels,
  visibleLevels,
  walkLevel,
  withLevelGeometry,
} from './levels'
import type { FloorPlan, PlanUpperLevel } from './types'

const upper: PlanUpperLevel = {
  id: 'lvl-2',
  name: 'Upper floor',
  elevation: 2.9,
  walls: [{ id: 'uw1', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
  openings: [],
  rooms: [{ id: 'up-bed', name: 'Bedroom (up)', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
}

const single: FloorPlan = {
  id: 'p1',
  name: 'Single',
  ceilingHeight: 2.6,
  extent: [4.2, 4.2],
  walls: [{ id: 'w1', start: [0.1, 0.1], end: [4.1, 0.1], thickness: 'external' }],
  openings: [],
  rooms: [{ id: 'g-living', name: 'Living', origin: [0.2, 0.2], width: 3.8, depth: 3.8 }],
}

const multi: FloorPlan = { ...single, id: 'p2', upperLevels: [upper] }

describe('cloneLevelGeometry', () => {
  const geom: LevelGeometry = {
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 'external' as const },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 'internal' as const },
    ],
    openings: [
      {
        id: 'o1',
        kind: 'window' as const,
        wallId: 'w1',
        offset: 1,
        width: 1,
        sill: 0.9,
        head: 2.1,
      },
      { id: 'o2', kind: 'door' as const, wallId: 'w2', offset: 0.5, width: 0.9, sill: 0, head: 2 },
    ],
    rooms: [{ id: 'r1', name: 'Room', origin: [0.1, 0.1] as [number, number], width: 3, depth: 2 }],
  }
  let n = 0
  const genId = (p: string) => `${p}-${n++}`

  it('gives every wall/opening/room a fresh id and maps old→new', () => {
    n = 0
    const c = cloneLevelGeometry(geom, genId)
    expect(c.walls.map((w) => w.id)).not.toEqual(['w1', 'w2'])
    expect(new Set(c.walls.map((w) => w.id)).size).toBe(2)
    expect(c.roomIdMap.r1).toBe(c.rooms[0].id)
    expect(c.wallIdMap.w1).toBe(c.walls[0].id)
  })

  it('re-points each cloned opening at its cloned wall', () => {
    n = 0
    const c = cloneLevelGeometry(geom, genId)
    expect(c.openings[0].wallId).toBe(c.wallIdMap.w1)
    expect(c.openings[1].wallId).toBe(c.wallIdMap.w2)
    expect(c.openings.map((o) => o.id)).not.toContain('o1')
  })

  it('deep-clones (mutating a clone leaves the source untouched)', () => {
    n = 0
    const c = cloneLevelGeometry(geom, genId)
    c.walls[0].start[0] = 99
    expect(geom.walls[0].start[0]).toBe(0)
  })
})

describe('planLevels', () => {
  it('always exposes the ground floor first, at elevation 0', () => {
    const levels = planLevels(single)
    expect(levels).toHaveLength(1)
    expect(levels[0].id).toBe(GROUND_LEVEL_ID)
    expect(levels[0].elevation).toBe(0)
    expect(levels[0].rooms).toBe(single.rooms)
  })
  it('appends upper levels in order', () => {
    const levels = planLevels(multi)
    expect(levels.map((l) => l.id)).toEqual([GROUND_LEVEL_ID, 'lvl-2'])
    expect(isMultiLevel(multi)).toBe(true)
    expect(isMultiLevel(single)).toBe(false)
  })
})

describe('levelById / levelElevation / levelOfItem', () => {
  it('resolves ground for undefined/ground/unknown ids', () => {
    expect(levelById(multi, undefined).id).toBe(GROUND_LEVEL_ID)
    expect(levelById(multi, GROUND_LEVEL_ID).id).toBe(GROUND_LEVEL_ID)
    expect(levelById(multi, 'nope').id).toBe(GROUND_LEVEL_ID)
    expect(levelElevation(multi, undefined)).toBe(0)
  })
  it('resolves an upper level and its elevation', () => {
    expect(levelById(multi, 'lvl-2').name).toBe('Upper floor')
    expect(levelElevation(multi, 'lvl-2')).toBe(2.9)
    expect(levelOfItem(multi, { levelId: 'lvl-2' }).id).toBe('lvl-2')
    expect(levelOfItem(multi, {}).id).toBe(GROUND_LEVEL_ID)
  })
})

describe('levelOfRoom / allPlanRooms', () => {
  it('finds the storey containing a room id (or null)', () => {
    expect(levelOfRoom(multi, 'g-living')?.id).toBe(GROUND_LEVEL_ID)
    expect(levelOfRoom(multi, 'up-bed')?.id).toBe('lvl-2')
    expect(levelOfRoom(multi, 'missing')).toBeNull()
  })
  it('lists every room across storeys, ground first', () => {
    expect(allPlanRooms(multi).map((r) => r.id)).toEqual(['g-living', 'up-bed'])
    // Single-storey plans return the same array (no realloc).
    expect(allPlanRooms(single)).toBe(single.rooms)
  })
})

describe('itemsOnLevel', () => {
  it('filters level-tagged records to one storey, untagged = ground', () => {
    const items = [
      { id: 'a' },
      { id: 'b', levelId: GROUND_LEVEL_ID },
      { id: 'c', levelId: 'lvl-2' },
    ]
    expect(itemsOnLevel(items, GROUND_LEVEL_ID).map((i) => i.id)).toEqual(['a', 'b'])
    expect(itemsOnLevel(items, 'lvl-2').map((i) => i.id)).toEqual(['c'])
    expect(itemsOnLevel(items, 'other')).toEqual([])
  })
})

describe('levelAsPlan / visibleLevels', () => {
  it('adapts an upper level into a single-level pseudo-plan', () => {
    const lvl = planLevels(multi)[1]
    const p = levelAsPlan(multi, lvl)
    expect(p.walls).toBe(upper.walls)
    expect(p.rooms).toBe(upper.rooms)
    expect(p.upperLevels).toBeUndefined()
    // Ground of a multi-level plan strips upperLevels (so recursion terminates);
    // single-storey plans keep the same reference.
    const g = levelAsPlan(multi, planLevels(multi)[0])
    expect(g.upperLevels).toBeUndefined()
    expect(g.rooms).toBe(multi.rooms)
    expect(levelAsPlan(single, planLevels(single)[0])).toBe(single)
  })
  it('filters to the selected level, falling back to all for stale ids', () => {
    expect(visibleLevels(multi, 'all').map((l) => l.id)).toEqual(['ground', 'lvl-2'])
    expect(visibleLevels(multi, 'lvl-2').map((l) => l.id)).toEqual(['lvl-2'])
    expect(visibleLevels(multi, 'stale').map((l) => l.id)).toEqual(['ground', 'lvl-2'])
  })
})

describe('walkLevel / levelSpawnPoint (ML6c)', () => {
  it("walks the ground floor for 'all' and for stale ids", () => {
    expect(walkLevel(multi, 'all').id).toBe(GROUND_LEVEL_ID)
    expect(walkLevel(multi, 'stale').id).toBe(GROUND_LEVEL_ID)
    expect(walkLevel(single, 'all').id).toBe(GROUND_LEVEL_ID)
  })
  it('walks the selected storey when a level id is picked', () => {
    const lvl = walkLevel(multi, 'lvl-2')
    expect(lvl.id).toBe('lvl-2')
    expect(lvl.elevation).toBe(2.9)
  })
  it('spawns at the centre of the first room of the storey', () => {
    const sp = levelSpawnPoint(walkLevel(multi, 'lvl-2'))
    expect(sp).not.toBeNull()
    expect(sp?.x).toBeCloseTo(0.2 + 3.8 / 2)
    expect(sp?.z).toBeCloseTo(0.2 + 3.8 / 2)
    expect(sp?.span).toBeCloseTo(3.8)
  })
  it('returns null for a storey with no rooms', () => {
    const empty = { ...multi, upperLevels: [{ ...upper, rooms: [] }] }
    expect(levelSpawnPoint(walkLevel(empty, 'lvl-2'))).toBeNull()
  })
})

describe('withLevelGeometry', () => {
  it('edits the ground arrays for ground/absent ids', () => {
    const next = withLevelGeometry(multi, undefined, (g) => ({
      rooms: [...g.rooms, { id: 'g-new', name: 'New', origin: [0, 0], width: 1, depth: 1 }],
    }))
    expect(next.rooms.map((r) => r.id)).toEqual(['g-living', 'g-new'])
    expect(next.upperLevels?.[0].rooms.map((r) => r.id)).toEqual(['up-bed'])
  })
  it('edits only the targeted upper level', () => {
    const next = withLevelGeometry(multi, 'lvl-2', (g) => ({
      walls: g.walls.filter((w) => w.id !== 'uw1'),
      rooms: [...g.rooms, { id: 'up-new', name: 'New', origin: [0, 0], width: 1, depth: 1 }],
    }))
    expect(next.walls).toBe(multi.walls) // ground untouched
    expect(next.upperLevels?.[0].walls).toEqual([])
    expect(next.upperLevels?.[0].rooms.map((r) => r.id)).toEqual(['up-bed', 'up-new'])
  })
})

describe('planRoomShell across levels (ML5)', () => {
  it('resolves an upper room against its own storey geometry', async () => {
    const { planRoomShell } = await import('./planRoomShell')
    const shell = planRoomShell(multi, 'up-bed')
    expect(shell).not.toBeNull()
    expect(shell?.levelId).toBe('lvl-2')
    // Clipped walls come from the UPPER level's wall set (uw1 spans the room).
    expect(shell?.walls.some((w) => w.wallId === 'uw1')).toBe(true)
    expect(shell?.walls.some((w) => w.wallId === 'w1')).toBe(false)
    // Ground rooms still resolve as before.
    expect(planRoomShell(multi, 'g-living')?.levelId).toBe('ground')
  })
})
