import { describe, expect, it } from 'vitest'
import {
  buildThresholdRisers,
  floorOffsetAtPoint,
  roomAndOffsetAtPoint,
  roomFloorOffsetM,
  roomFloorOffsetsForLevel,
  wallBaseExtensionM,
} from './floorLevels3d'
import type { FloorPlan, PlanRoom, PlanUpperLevel } from './types'

function twoRoomPlan(aLevel?: number, bLevel?: number): FloorPlan {
  const a: PlanRoom = {
    id: 'A',
    name: 'Bath',
    category: 'bath',
    origin: [0, 0],
    width: 3,
    depth: 3,
    floorLevelMm: aLevel,
  }
  const b: PlanRoom = {
    id: 'B',
    name: 'Bedroom',
    category: 'bedroom',
    origin: [3, 0],
    width: 3,
    depth: 3,
    floorLevelMm: bLevel,
  }
  return {
    id: 'p',
    name: 'p',
    ceilingHeight: 2.8,
    extent: [6, 3],
    walls: [{ id: 'w-shared', start: [3, 0], end: [3, 3], thickness: 'internal' }],
    openings: [
      { id: 'd1', kind: 'door', wallId: 'w-shared', offset: 1, width: 1, sill: 0, head: 2.1 },
    ],
    rooms: [a, b],
  }
}

describe('roomFloorOffsetM', () => {
  it('is 0 when the flag is off, regardless of the room value', () => {
    expect(roomFloorOffsetM({ floorLevelMm: -50 }, false)).toBe(0)
  })
  it('converts mm to metres when the flag is on', () => {
    expect(roomFloorOffsetM({ floorLevelMm: -50 }, true)).toBeCloseTo(-0.05)
    expect(roomFloorOffsetM({ floorLevelMm: 25 }, true)).toBeCloseTo(0.025)
  })
  it('defaults an unset/non-finite level to 0', () => {
    expect(roomFloorOffsetM({}, true)).toBe(0)
    expect(roomFloorOffsetM({ floorLevelMm: Number.NaN }, true)).toBe(0)
  })
})

describe('wallBaseExtensionM', () => {
  it('extends downward only for a lowered (negative) floor', () => {
    expect(wallBaseExtensionM(-0.05)).toBeCloseTo(0.05)
    expect(wallBaseExtensionM(0)).toBe(0)
    expect(wallBaseExtensionM(0.05)).toBe(0) // raised floor needs no extension
  })
})

describe('floorOffsetAtPoint / roomAndOffsetAtPoint', () => {
  it('resolves the offset of whichever room contains the point', () => {
    const plan = twoRoomPlan(-50, 0)
    expect(floorOffsetAtPoint(plan, 1.5, 1.5, true)).toBeCloseTo(-0.05) // inside A
    expect(floorOffsetAtPoint(plan, 4.5, 1.5, true)).toBe(0) // inside B (level)
  })
  it('is 0 outside every room and when the flag is off', () => {
    const plan = twoRoomPlan(-50, 0)
    expect(floorOffsetAtPoint(plan, 100, 100, true)).toBe(0)
    expect(floorOffsetAtPoint(plan, 1.5, 1.5, false)).toBe(0)
  })
  it('roomAndOffsetAtPoint returns the owning room + its offset', () => {
    const plan = twoRoomPlan(-50, 0)
    const hit = roomAndOffsetAtPoint(plan.rooms, 1.5, 1.5, true)
    expect(hit.room?.id).toBe('A')
    expect(hit.offsetM).toBeCloseTo(-0.05)
    const miss = roomAndOffsetAtPoint(plan.rooms, 100, 100, true)
    expect(miss.room).toBeNull()
    expect(miss.offsetM).toBe(0)
  })
  it('scopes to an upper level when levelId is given', () => {
    const ground = twoRoomPlan(-50, 0)
    const upper: PlanUpperLevel = {
      id: 'L2',
      name: 'Upper',
      elevation: 3,
      walls: [],
      openings: [],
      rooms: [{ id: 'C', name: 'Loft', origin: [0, 0], width: 2, depth: 2, floorLevelMm: -25 }],
    }
    const plan: FloorPlan = { ...ground, upperLevels: [upper] }
    expect(floorOffsetAtPoint(plan, 1, 1, true, 'L2')).toBeCloseTo(-0.025)
    // Ground lookup unaffected by the upper level's rooms.
    expect(floorOffsetAtPoint(plan, 1.5, 1.5, true)).toBeCloseTo(-0.05)
  })
})

describe('roomFloorOffsetsForLevel', () => {
  it('maps only rooms with a non-zero offset', () => {
    const plan = twoRoomPlan(-50, 0)
    const map = roomFloorOffsetsForLevel(plan, undefined, true)
    expect(map.get('A')).toBeCloseTo(-0.05)
    expect(map.has('B')).toBe(false) // level with the datum → not in the map
  })
  it('is empty when the flag is off', () => {
    const plan = twoRoomPlan(-50, 0)
    expect(roomFloorOffsetsForLevel(plan, undefined, false).size).toBe(0)
  })
})

describe('buildThresholdRisers', () => {
  it('emits a riser at a step transition with the resolved opening geometry', () => {
    const plan = twoRoomPlan(-50, 0)
    const risers = buildThresholdRisers(plan, true, (openingId) =>
      openingId === 'd1' ? { width: 1, angle: Math.PI / 2 } : undefined,
    )
    expect(risers).toHaveLength(1)
    const r = risers[0]!
    expect(r.openingId).toBe('d1')
    expect(r.length).toBe(1)
    expect(r.angle).toBeCloseTo(Math.PI / 2)
    expect(r.riseM).toBeCloseTo(0.05)
    expect(r.bottomY).toBeCloseTo(-0.05)
    expect(r.topY).toBeCloseTo(0)
  })

  it('emits nothing when the flag is off, rooms are level, or geometry is unresolved', () => {
    const stepped = twoRoomPlan(-50, 0)
    expect(buildThresholdRisers(stepped, false, () => ({ width: 1, angle: 0 }))).toHaveLength(0)
    expect(buildThresholdRisers(stepped, true, () => undefined)).toHaveLength(0)
    const level = twoRoomPlan(0, 0)
    expect(buildThresholdRisers(level, true, () => ({ width: 1, angle: 0 }))).toHaveLength(0)
  })

  it('offsets rY by the storey elevation for an upper-level transition', () => {
    const upper: PlanUpperLevel = {
      id: 'L2',
      name: 'Upper',
      elevation: 3,
      walls: [{ id: 'w-shared', start: [3, 0], end: [3, 3], thickness: 'internal' }],
      openings: [
        { id: 'd2', kind: 'door', wallId: 'w-shared', offset: 1, width: 1, sill: 0, head: 2.1 },
      ],
      rooms: [
        { id: 'C', name: 'Bath2', origin: [0, 0], width: 3, depth: 3, floorLevelMm: -25 },
        { id: 'D', name: 'Bed2', origin: [3, 0], width: 3, depth: 3, floorLevelMm: 0 },
      ],
    }
    const plan: FloorPlan = { ...twoRoomPlan(0, 0), upperLevels: [upper] }
    const risers = buildThresholdRisers(plan, true, (openingId) =>
      openingId === 'd2' ? { width: 1, angle: 0 } : undefined,
    )
    expect(risers).toHaveLength(1)
    const r = risers[0]!
    expect(r.levelId).toBe('L2')
    expect(r.bottomY).toBeCloseTo(3 - 0.025)
    expect(r.topY).toBeCloseTo(3)
  })
})
