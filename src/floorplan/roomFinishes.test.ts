import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN_FLOOR, resolvePlanRoomFloor, resolvePlanRoomWall } from './roomFinishes'
import type { PlanRoom } from './types'

const room = (over: Partial<PlanRoom> = {}): PlanRoom => ({
  id: 'r1',
  name: 'Room 1',
  origin: [0, 0],
  width: 4,
  depth: 3,
  ...over,
})

describe('resolvePlanRoomFloor', () => {
  it('prefers the live finishes entry over the plan room default', () => {
    expect(
      resolvePlanRoomFloor(
        { floor: { r1: 'floor-tile-grey' }, walls: {} },
        room({ floor: 'floor-wood-oak' }),
      ),
    ).toBe('floor-tile-grey')
  })

  it('falls back to the plan room floor, then the app default', () => {
    expect(
      resolvePlanRoomFloor({ floor: {}, walls: {} }, room({ floor: 'floor-wood-walnut' })),
    ).toBe('floor-wood-walnut')
    expect(resolvePlanRoomFloor({ floor: {}, walls: {} }, room())).toBe(DEFAULT_PLAN_FLOOR)
  })

  it('ignores finishes keyed by other rooms', () => {
    expect(resolvePlanRoomFloor({ floor: { other: 'floor-tile-grey' }, walls: {} }, room())).toBe(
      DEFAULT_PLAN_FLOOR,
    )
  })
})

describe('resolvePlanRoomWall', () => {
  it('prefers the live finishes entry, then the plan room wall, else null', () => {
    expect(
      resolvePlanRoomWall(
        { floor: {}, walls: { r1: 'wall-paint-sage' } },
        room({ wall: 'wall-paint-white' }),
      ),
    ).toBe('wall-paint-sage')
    expect(resolvePlanRoomWall({ floor: {}, walls: {} }, room({ wall: 'wall-paint-white' }))).toBe(
      'wall-paint-white',
    )
    expect(resolvePlanRoomWall({ floor: {}, walls: {} }, room())).toBeNull()
  })
})
