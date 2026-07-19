import { describe, expect, it } from 'vitest'
import { WALLS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import { roomWallLabel, roomWalls } from './roomWalls'

/** A simple 2-room custom plan (id ≠ the default plan id, so it routes through
 *  the plan-derived shell rather than the fixed apartment). Room A is the SW
 *  4×4 room; its four walls each face a distinct compass side. */
const CUSTOM_PLAN: FloorPlan = {
  id: 'custom',
  name: 'Two rooms',
  extent: [8, 4],
  ceilingHeight: 2.6,
  walls: [
    { id: 'north', start: [0, 0], end: [8, 0], thickness: 'internal' },
    { id: 'mid', start: [4, 0], end: [4, 4], thickness: 'internal' },
    { id: 'wA', start: [0, 0], end: [0, 4], thickness: 'internal' },
    { id: 'south', start: [0, 4], end: [8, 4], thickness: 'internal' },
  ],
  openings: [],
  rooms: [
    { id: 'A', name: 'A', origin: [0, 0], width: 4, depth: 4 },
    { id: 'B', name: 'B', origin: [4, 0], width: 4, depth: 4 },
  ],
} as unknown as FloorPlan

describe('roomWalls — fixed apartment', () => {
  it('enumerates a fixed-apartment room using WALLS-constant ids', () => {
    const walls = roomWalls(buildDefaultPlan(), 'livingDining')
    expect(walls.length).toBeGreaterThanOrEqual(3)
    const knownIds = new Set(WALLS.map((w) => w.id))
    for (const w of walls) {
      // Wall ids match the accent-key scheme (the same ids WallSegment stamps).
      expect(knownIds.has(w.wallId)).toBe(true)
      expect(w.roomId).toBe('livingDining')
      expect(w.length).toBeGreaterThan(0)
      expect(['N', 'S', 'E', 'W']).toContain(w.side)
    }
    // One entry per source wall id (clips collapsed).
    expect(new Set(walls.map((w) => w.wallId)).size).toBe(walls.length)
  })

  it('returns [] for an unknown room id', () => {
    expect(roomWalls(buildDefaultPlan(), 'nope')).toEqual([])
    expect(roomWalls(CUSTOM_PLAN, 'nope')).toEqual([])
  })
})

describe('roomWalls — custom plan', () => {
  it('enumerates a custom-plan room with one wall per compass side', () => {
    const walls = roomWalls(CUSTOM_PLAN, 'A')
    // Room A is bounded by all four walls (north/south/mid/wA), clipped to 0..4.
    const bySide = new Map(walls.map((w) => [w.side, w]))
    expect(bySide.get('N')?.wallId).toBe('north')
    expect(bySide.get('S')?.wallId).toBe('south')
    expect(bySide.get('E')?.wallId).toBe('mid')
    expect(bySide.get('W')?.wallId).toBe('wA')
    // The shared north wall is clipped to room A's 4 m span, not the full 8 m.
    expect(bySide.get('N')?.length).toBeCloseTo(4, 1)
    // Stable order: N, E, S, W.
    expect(walls.map((w) => w.side)).toEqual(['N', 'E', 'S', 'W'])
  })
})

describe('roomWallLabel', () => {
  it('formats compass side + length, unit-aware', () => {
    const wall = roomWalls(CUSTOM_PLAN, 'A').find((w) => w.side === 'N')
    expect(wall).toBeDefined()
    if (!wall) return
    expect(roomWallLabel(wall)).toBe('North wall · 4.00 m')
    expect(roomWallLabel(wall, 'imperial')).toMatch(/^North wall · \d+′ \d+″$/)
  })
})
