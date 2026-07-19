import { describe, expect, it } from 'vitest'
import {
  buildFloorTransitions,
  buildKerbAdvisories,
  buildRoomFflTags,
  fflTag,
  hasExplicitFloorLevel,
  roomFloorLevelMm,
} from './floorLevels'
import type { FloorPlan, PlanRoom, RoomCategory } from './types'

/** Two rooms side-by-side along X, sharing a vertical wall at x=3 with a door. */
function twoRoomPlan(
  aCat: RoomCategory,
  bCat: RoomCategory,
  aLevel?: number,
  bLevel?: number,
): FloorPlan {
  const a: PlanRoom = {
    id: 'A',
    name: 'Bath',
    category: aCat,
    origin: [0, 0],
    width: 3,
    depth: 3,
    floorLevelMm: aLevel,
  }
  const b: PlanRoom = {
    id: 'B',
    name: 'Bedroom',
    category: bCat,
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

describe('roomFloorLevelMm / hasExplicitFloorLevel', () => {
  it('defaults an unset level to 0 and is total', () => {
    expect(roomFloorLevelMm({})).toBe(0)
    expect(roomFloorLevelMm({ floorLevelMm: -50 })).toBe(-50)
    expect(roomFloorLevelMm({ floorLevelMm: Number.NaN })).toBe(0)
  })
  it('detects an explicit level', () => {
    expect(hasExplicitFloorLevel({})).toBe(false)
    expect(hasExplicitFloorLevel({ floorLevelMm: 0 })).toBe(true)
    expect(hasExplicitFloorLevel({ floorLevelMm: -25 })).toBe(true)
  })
})

describe('fflTag', () => {
  it('formats zero / positive / negative offsets', () => {
    expect(fflTag(0)).toBe('FFL ±0')
    expect(fflTag(25)).toBe('FFL +25')
    expect(fflTag(-50)).toBe('FFL −50')
  })
})

describe('buildRoomFflTags', () => {
  it('emits a tag only for rooms with an explicit level', () => {
    const tags = buildRoomFflTags(twoRoomPlan('bath', 'bedroom', -50))
    expect(tags).toHaveLength(1)
    expect(tags[0]!.roomId).toBe('A')
    expect(tags[0]!.tag).toBe('FFL −50')
    expect(tags[0]!.labelPos).toEqual([1.5, 1.5]) // bath centre
  })
})

describe('buildFloorTransitions', () => {
  it('detects a step across a doorway between rooms at different levels', () => {
    const trs = buildFloorTransitions(twoRoomPlan('bath', 'bedroom', -50, 0))
    expect(trs).toHaveLength(1)
    expect(trs[0]!.stepMm).toBe(50)
    expect(trs[0]!.openingId).toBe('d1')
    expect(trs[0]!.center[0]).toBeCloseTo(3)
    expect(trs[0]!.note).toContain('50 mm step')
  })

  it('emits no transition when both rooms are level', () => {
    expect(buildFloorTransitions(twoRoomPlan('bath', 'bedroom', 0, 0))).toHaveLength(0)
    expect(buildFloorTransitions(twoRoomPlan('bath', 'bedroom'))).toHaveLength(0)
  })
})

describe('buildKerbAdvisories', () => {
  it('flags a wet room level with an adjacent dry room', () => {
    const adv = buildKerbAdvisories(twoRoomPlan('bath', 'bedroom', 0, 0))
    expect(adv).toHaveLength(1)
    expect(adv[0]!.wetRoomName).toBe('Bath')
    expect(adv[0]!.dryRoomName).toBe('Bedroom')
  })

  it('does NOT flag when the wet room is already stepped down', () => {
    expect(buildKerbAdvisories(twoRoomPlan('bath', 'bedroom', -50, 0))).toHaveLength(0)
  })

  it('does NOT flag two dry rooms or two wet rooms', () => {
    expect(buildKerbAdvisories(twoRoomPlan('bedroom', 'living', 0, 0))).toHaveLength(0)
    expect(buildKerbAdvisories(twoRoomPlan('bath', 'powder', 0, 0))).toHaveLength(0)
  })
})
