import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { buildOpeningSchedule } from './openingSchedule'

/**
 * Synthetic plans: a room is a square in the XZ plane; a horizontal wall along
 * z = origin.z carries the opening. Window/door height = head − sill.
 */
function rectRoom(id: string, name: string, x: number, z: number, side: number): PlanRoom {
  return { id, name, origin: [x, z], width: side, depth: side }
}

/** A horizontal wall running west→east along z = `z`, from x to x+len. */
function hWall(id: string, x: number, z: number, len: number): PlanWall {
  return { id, start: [x, z], end: [x + len, z], thickness: 'external' }
}

function win(
  id: string,
  wallId: string,
  offset: number,
  width: number,
  sill: number,
  head: number,
): PlanOpening {
  return { id, kind: 'window', wallId, offset, width, sill, head }
}

function door(
  id: string,
  wallId: string,
  offset: number,
  width: number,
  head: number,
  extra: Partial<PlanOpening> = {},
): PlanOpening {
  return { id, kind: 'door', wallId, offset, width, sill: 0, head, ...extra }
}

function plan(rooms: PlanRoom[], walls: PlanWall[], openings: PlanOpening[]): FloorPlan {
  return { id: 'p', name: 'Test', ceilingHeight: 2.8, extent: [20, 20], walls, openings, rooms }
}

describe('buildOpeningSchedule — grouping into marks', () => {
  const room = rectRoom('living', 'Living', 0, 0, 4)
  const wall = hWall('w-n', 0, 0, 4)

  it('groups openings with identical (kind, width, height) into one mark with a count', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          win('w1', 'w-n', 0.5, 1.2, 0.9, 2.1),
          win('w2', 'w-n', 2.0, 1.2, 0.9, 2.1), // identical → same mark
        ],
      ),
    )
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].mark).toBe('W1')
    expect(sched.marks[0].count).toBe(2)
    expect(sched.windowCount).toBe(2)
  })

  it('separates differing sizes into distinct marks (W1, W2)', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          win('w1', 'w-n', 0.2, 1.2, 0.9, 2.1),
          win('w2', 'w-n', 2.0, 0.6, 0.9, 2.1), // narrower → new mark
        ],
      ),
    )
    expect(sched.marks.map((m) => m.mark)).toEqual(['W1', 'W2'])
    expect(sched.marks[0].count).toBe(1)
    expect(sched.marks[1].count).toBe(1)
  })

  it('labels doors D1/D2… before windows W1/W2…', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          win('w1', 'w-n', 0.2, 1.2, 0.9, 2.1),
          door('d1', 'w-n', 1.6, 0.9, 2.1),
          door('d2', 'w-n', 2.6, 1.0, 2.1), // different width → D2
        ],
      ),
    )
    expect(sched.marks.map((m) => m.mark)).toEqual(['D1', 'D2', 'W1'])
    expect(sched.doorCount).toBe(2)
    expect(sched.windowCount).toBe(1)
  })

  it('computes height = head − sill and records width + sill', () => {
    const sched = buildOpeningSchedule(plan([room], [wall], [win('w1', 'w-n', 1, 1.5, 0.8, 2.0)]))
    const m = sched.marks[0]
    expect(m.width).toBeCloseTo(1.5)
    expect(m.height).toBeCloseTo(1.2) // 2.0 − 0.8
    expect(m.sill).toBeCloseTo(0.8)
  })

  it('floors a negative head−sill height at zero', () => {
    const sched = buildOpeningSchedule(plan([room], [wall], [win('w1', 'w-n', 1, 1, 2.1, 1.0)]))
    expect(sched.marks[0].height).toBe(0)
  })

  it('captures door swing + hinge (defaulting unset to right/start)', () => {
    const sched = buildOpeningSchedule(
      plan([room], [wall], [door('d1', 'w-n', 1, 0.9, 2.1, { swing: 'left', hinge: 'end' })]),
    )
    const d = sched.marks[0]
    expect(d.swing).toBe('left')
    expect(d.hinge).toBe('end')
    const def = buildOpeningSchedule(plan([room], [wall], [door('d2', 'w-n', 1, 0.9, 2.1)]))
    expect(def.marks[0].swing).toBe('right')
    expect(def.marks[0].hinge).toBe('start')
  })

  it('windows carry no swing/hinge', () => {
    const sched = buildOpeningSchedule(plan([room], [wall], [win('w1', 'w-n', 1, 1.2, 0.9, 2.1)]))
    expect(sched.marks[0].swing).toBeUndefined()
    expect(sched.marks[0].hinge).toBeUndefined()
  })
})

describe('buildOpeningSchedule — room attribution', () => {
  it('lists the room a window borders', () => {
    const room = rectRoom('living', 'Living', 0, 0, 4)
    const sched = buildOpeningSchedule(
      plan([room], [hWall('w-n', 0, 0, 4)], [win('w1', 'w-n', 1, 1.2, 0.9, 2.1)]),
    )
    expect(sched.marks[0].rooms).toEqual(['Living'])
  })

  it('lists both rooms a door between two rooms borders', () => {
    // Two stacked 4×4 rooms; the shared wall at z=4 has a door connecting them.
    const a = rectRoom('a', 'Bedroom', 0, 0, 4) // z [0,4]
    const b = rectRoom('b', 'Hall', 0, 4, 4) // z [4,8]
    const sched = buildOpeningSchedule(
      plan([a, b], [hWall('mid', 0, 4, 4)], [door('d1', 'mid', 1, 0.9, 2.1)]),
    )
    expect(sched.marks[0].rooms).toEqual(['Bedroom', 'Hall'])
  })

  it('buckets an opening on a missing wall as Unassigned (does not crash)', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4)
    const sched = buildOpeningSchedule(
      plan([room], [hWall('w', 0, 0, 4)], [win('orphan', 'no-such-wall', 0, 1.2, 0.9, 2.1)]),
    )
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].rooms).toEqual(['Unassigned'])
  })

  it('buckets an opening that borders no room as Unassigned', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4)
    const sched = buildOpeningSchedule(
      plan([room], [hWall('far', 50, 50, 4)], [win('w', 'far', 0, 1.2, 0.9, 2.1)]),
    )
    expect(sched.marks[0].rooms).toEqual(['Unassigned'])
  })

  it('sorts Unassigned last when a mark touches both rooms and orphans', () => {
    const room = rectRoom('living', 'Living', 0, 0, 4)
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [hWall('w-n', 0, 0, 4), hWall('far', 50, 50, 4)],
        [
          win('w1', 'w-n', 1, 1.2, 0.9, 2.1), // → Living
          win('w2', 'far', 0, 1.2, 0.9, 2.1), // identical size, orphan
        ],
      ),
    )
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].count).toBe(2)
    expect(sched.marks[0].rooms).toEqual(['Living', 'Unassigned'])
  })
})

describe('buildOpeningSchedule — edge cases', () => {
  it('an empty plan yields no marks', () => {
    const sched = buildOpeningSchedule(plan([], [], []))
    expect(sched.marks).toEqual([])
    expect(sched.doorCount).toBe(0)
    expect(sched.windowCount).toBe(0)
  })

  it('ignores absent opening/wall/room arrays', () => {
    const bare = {
      id: 'p',
      name: 'Bare',
      ceilingHeight: 2.8,
      extent: [10, 10],
    } as unknown as FloorPlan
    expect(() => buildOpeningSchedule(bare)).not.toThrow()
    expect(buildOpeningSchedule(bare).marks).toEqual([])
  })

  it('groups identical openings across storeys into one mark (multi-storey)', () => {
    const ground = plan(
      [rectRoom('g', 'Living', 0, 0, 4)],
      [hWall('gw', 0, 0, 4)],
      [win('gw1', 'gw', 1, 1.2, 0.9, 2.1)],
    )
    const multi: FloorPlan = {
      ...ground,
      upperLevels: [
        {
          id: 'up',
          name: 'Upper',
          elevation: 2.9,
          walls: [hWall('uw', 0, 0, 4)],
          openings: [win('uw1', 'uw', 1, 1.2, 0.9, 2.1)], // identical size
          rooms: [rectRoom('u', 'Bedroom', 0, 0, 4)],
        },
      ],
    }
    const sched = buildOpeningSchedule(multi)
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].count).toBe(2)
    expect(sched.windowCount).toBe(2)
    expect(sched.marks[0].rooms).toEqual(['Bedroom', 'Living'])
  })
})
