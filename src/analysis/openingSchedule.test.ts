import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import {
  assignOpeningMarks,
  buildOpeningSchedule,
  openingStyleMaterialLabel,
} from './openingSchedule'

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
  extra: Partial<PlanOpening> = {},
): PlanOpening {
  return { id, kind: 'window', wallId, offset, width, sill, head, ...extra }
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

describe('assignOpeningMarks — single-storey per-opening labels', () => {
  const wall = hWall('w-n', 0, 0, 8)
  const room = rectRoom('living', 'Living', 0, 0, 8)

  it('assigns D1/D2… then W1/W2… in discovery order, matching buildOpeningSchedule', () => {
    const openings: PlanOpening[] = [
      door('d1', 'w-n', 0, 0.8, 2.1), // D1
      win('win1', 'w-n', 1, 1.2, 0.9, 2.1), // W1
      door('d2', 'w-n', 2, 0.9, 2.1), // D2 (different width)
      door('d3', 'w-n', 3, 0.8, 2.1), // same size as d1 → D1
    ]
    const marks = assignOpeningMarks(plan([room], [wall], openings))
    expect(marks.get('d1')).toBe('D1')
    expect(marks.get('d3')).toBe('D1')
    expect(marks.get('d2')).toBe('D2')
    expect(marks.get('win1')).toBe('W1')

    // Cross-check: the SAME plan run through `buildOpeningSchedule` groups d1/d3
    // into one D-mark with count 2, and assigns marks in the same D-before-W,
    // discovery order — so the two never drift for a single-storey plan.
    const sched = buildOpeningSchedule(plan([room], [wall], openings))
    const doorMarks = sched.marks.filter((m) => m.kind === 'door')
    expect(doorMarks.map((m) => m.mark)).toEqual(['D1', 'D2'])
    expect(doorMarks.find((m) => m.mark === 'D1')!.count).toBe(2)
    expect(sched.marks.find((m) => m.mark === 'W1')).toBeDefined()
  })

  it('non-door/window openings are skipped and unaffected windows/doors still get marks', () => {
    const openings: PlanOpening[] = [win('w1', 'w-n', 0, 1, 0.9, 2.1)]
    const marks = assignOpeningMarks(plan([room], [wall], openings))
    expect(marks.size).toBe(1)
    expect(marks.get('w1')).toBe('W1')
  })

  it('an empty plan yields an empty map', () => {
    expect(assignOpeningMarks(plan([], [], [])).size).toBe(0)
  })
})

describe('opening style/material grouping (openingStyles axes)', () => {
  const room = rectRoom('living', 'Living', 0, 0, 8)
  const wall = hWall('w-n', 0, 0, 8)

  it('LEGACY: same-size openings with no style/material still collapse to one mark', () => {
    const sched = buildOpeningSchedule(
      plan([room], [wall], [door('d1', 'w-n', 0, 0.9, 2.1), door('d2', 'w-n', 2, 0.9, 2.1)]),
    )
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].mark).toBe('D1')
    expect(sched.marks[0].count).toBe(2)
    // Normalised defaults are surfaced on the mark.
    expect(sched.marks[0].style).toBe('panel')
    expect(sched.marks[0].material).toBe('painted')
  })

  it('an explicit default-style door groups with a legacy (unset) door of the same size', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          door('legacy', 'w-n', 0, 0.9, 2.1),
          door('explicit', 'w-n', 2, 0.9, 2.1, { style: 'panel', material: 'painted' }),
        ],
      ),
    )
    expect(sched.marks).toHaveLength(1)
    expect(sched.marks[0].count).toBe(2)
  })

  it('splits a sliding door and a swing door of identical size into separate marks', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          door('swing', 'w-n', 0, 0.9, 2.1), // default → panel/painted
          door('slide', 'w-n', 2, 0.9, 2.1, { style: 'sliding' }),
        ],
      ),
    )
    expect(sched.marks.map((m) => m.mark)).toEqual(['D1', 'D2'])
    expect(sched.marks.map((m) => m.style)).toEqual(['panel', 'sliding'])
    expect(sched.marks.every((m) => m.count === 1)).toBe(true)
  })

  it('splits same-size doors of different leaf material into separate marks', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          door('painted', 'w-n', 0, 0.9, 2.1, { material: 'painted' }),
          door('wood', 'w-n', 2, 0.9, 2.1, { material: 'wood' }),
        ],
      ),
    )
    expect(sched.marks).toHaveLength(2)
    expect(sched.marks.map((m) => m.material)).toEqual(['painted', 'wood'])
  })

  it('splits a grille window from a plain window of identical size (windows carry no material)', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          win('plain', 'w-n', 0, 1.2, 0.9, 2.1),
          win('grille', 'w-n', 2, 1.2, 0.9, 2.1, { style: 'grille' }),
        ],
      ),
    )
    expect(sched.marks.map((m) => m.mark)).toEqual(['W1', 'W2'])
    expect(sched.marks.map((m) => m.style)).toEqual(['plain', 'grille'])
    expect(sched.marks.every((m) => m.material === undefined)).toBe(true)
  })

  it('produces readable Style / material labels', () => {
    const sched = buildOpeningSchedule(
      plan(
        [room],
        [wall],
        [
          door('slide', 'w-n', 0, 0.9, 2.1, { style: 'sliding', material: 'wood' }),
          win('grille', 'w-n', 2, 1.2, 0.9, 2.1, { style: 'invisible-grille' }),
        ],
      ),
    )
    expect(openingStyleMaterialLabel(sched.marks[0])).toBe('Sliding · Wood')
    expect(openingStyleMaterialLabel(sched.marks[1])).toBe('Invisible grille')
  })
})

describe('multi-storey mark agreement (schedule ↔ plan callouts ↔ DXF)', () => {
  it('numbers upper-storey openings continuously, and assignOpeningMarks matches the schedule for every storey', () => {
    // Ground: one window + one door. Upper: a different-size door + a
    // different-size window — the schedule numbers them D2/W2, continuing the
    // ground numbering.
    const ground = plan(
      [rectRoom('g', 'Living', 0, 0, 4)],
      [hWall('gw', 0, 0, 4)],
      [win('gwin', 'gw', 1, 1.2, 0.9, 2.1), door('gdoor', 'gw', 2.5, 0.9, 2.1)],
    )
    const multi: FloorPlan = {
      ...ground,
      upperLevels: [
        {
          id: 'up',
          name: 'Upper',
          elevation: 2.9,
          walls: [hWall('uw', 0, 0, 4)],
          openings: [door('udoor', 'uw', 0, 0.7, 2.1), win('uwin', 'uw', 1.5, 2.4, 0.4, 2.4)],
          rooms: [rectRoom('u', 'Bedroom', 0, 0, 4)],
        },
      ],
    }

    const sched = buildOpeningSchedule(multi)
    // Map each opening id → its aggregated schedule mark (via its group).
    const marks = assignOpeningMarks(multi)

    // Ground openings keep the lowest numbers…
    expect(marks.get('gdoor')).toBe('D1')
    expect(marks.get('gwin')).toBe('W1')
    // …and the upper-storey openings CONTINUE the numbering (regression: they
    // used to restart at D1/W1 on the per-level plan sheet).
    expect(marks.get('udoor')).toBe('D2')
    expect(marks.get('uwin')).toBe('W2')

    // Every per-opening mark exists as an aggregated mark in the schedule.
    const schedMarks = new Set(sched.marks.map((m) => m.mark))
    for (const label of marks.values()) expect(schedMarks.has(label)).toBe(true)
  })
})
