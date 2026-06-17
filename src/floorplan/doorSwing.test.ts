import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOOR_HINGE,
  DEFAULT_DOOR_SWING,
  defaultDoorSwing,
  doorHinge,
  doorSwing,
  doorSwingClearRect,
  doorSwingGeometry,
} from './doorSwing'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'

// Horizontal wall along +X; a 1 m door from x=1 to x=2.
const wall: PlanWall = { id: 'w', start: [0, 0], end: [3, 0], thickness: 'internal' }
const base: PlanOpening = {
  id: 'd',
  kind: 'door',
  wallId: 'w',
  offset: 1,
  width: 1,
  sill: 0,
  head: 2.1,
}

describe('door hinge/swing defaults', () => {
  it('falls back to start/right when unset', () => {
    expect(doorHinge(base)).toBe(DEFAULT_DOOR_HINGE)
    expect(doorSwing(base)).toBe(DEFAULT_DOOR_SWING)
    expect(DEFAULT_DOOR_HINGE).toBe('start')
    expect(DEFAULT_DOOR_SWING).toBe('right')
  })
  it('honours explicit values', () => {
    expect(doorHinge({ ...base, hinge: 'end' })).toBe('end')
    expect(doorSwing({ ...base, swing: 'left' })).toBe('left')
  })
})

describe('doorSwingGeometry', () => {
  it('pivots at the start jamb and swings to +Z by default', () => {
    const g = doorSwingGeometry(wall, base)!
    expect(g.hinge).toEqual([1, 0])
    expect(g.freeJamb).toEqual([2, 0])
    expect(g.leafTip).toEqual([1, 1])
    expect(g.normal).toEqual([0, 1])
    expect([0, 1]).toContain(g.sweep)
  })
  it('flips the hinge to the end jamb — and the swing side with it', () => {
    // hinge='end' mirrors the swing side (to match the 3D leaf): a default
    // ('right') door now opens to -Z, the leaf tip pivoting on the end jamb.
    const g = doorSwingGeometry(wall, { ...base, hinge: 'end' })!
    expect(g.hinge).toEqual([2, 0])
    expect(g.freeJamb).toEqual([1, 0])
    expect(g.normal).toEqual([0, -1])
    expect(g.leafTip).toEqual([2, -1])
  })
  it('hinge + swing both flipping returns to the start-jamb side', () => {
    // end+left = start+right side (+Z), pivoting on the end jamb.
    const g = doorSwingGeometry(wall, { ...base, hinge: 'end', swing: 'left' })!
    expect(g.normal).toEqual([0, 1])
    expect(g.leafTip).toEqual([2, 1])
  })
  it('flips the swing to the opposite side', () => {
    const g = doorSwingGeometry(wall, { ...base, swing: 'left' })!
    expect(g.normal).toEqual([0, -1])
    expect(g.leafTip).toEqual([1, -1])
  })
  it('returns null for a zero-length wall', () => {
    expect(doorSwingGeometry({ ...wall, end: [0, 0] }, base)).toBeNull()
  })
})

function makePlan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    ceilingHeight: 2.6,
    extent: [6, 6],
    walls: [wall],
    openings: [],
    rooms,
  }
}
const room = (id: string, origin: [number, number], w: number, d: number): PlanRoom => ({
  id,
  name: id,
  origin,
  width: w,
  depth: d,
})

describe('defaultDoorSwing', () => {
  it('swings into the room on the +Z (right) side', () => {
    const plan = makePlan([room('a', [0, 0], 3, 3)])
    expect(defaultDoorSwing(plan, wall, 1, 1)).toBe('right')
  })
  it('swings into the room on the -Z (left) side', () => {
    const plan = makePlan([room('a', [0, -3], 3, 3)])
    expect(defaultDoorSwing(plan, wall, 1, 1)).toBe('left')
  })
  it('falls back to the default when both sides are rooms', () => {
    const plan = makePlan([room('a', [0, 0], 3, 3), room('b', [0, -3], 3, 3)])
    expect(defaultDoorSwing(plan, wall, 1, 1)).toBe(DEFAULT_DOOR_SWING)
  })
  it('falls back to the default when neither side is a room', () => {
    expect(defaultDoorSwing(makePlan([]), wall, 1, 1)).toBe(DEFAULT_DOOR_SWING)
  })
})

describe('doorSwingClearRect', () => {
  it('covers only the swing-side quarter', () => {
    const r = doorSwingClearRect(wall, base)!
    expect(r).toEqual({ x0: 1, z0: 0, x1: 2, z1: 1 })
  })
  it('mirrors to the other side when the swing flips', () => {
    const r = doorSwingClearRect(wall, { ...base, swing: 'left' })!
    expect(r).toEqual({ x0: 1, z0: -1, x1: 2, z1: 0 })
  })
})
