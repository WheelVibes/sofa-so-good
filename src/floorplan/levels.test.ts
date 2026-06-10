import { describe, expect, it } from 'vitest'
import {
  allPlanRooms,
  GROUND_LEVEL_ID,
  isMultiLevel,
  levelById,
  levelElevation,
  levelOfItem,
  levelOfRoom,
  planLevels,
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
