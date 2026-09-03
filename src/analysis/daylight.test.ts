import { describe, expect, it } from 'vitest'
import { roomCategory } from '../floorplan/roomCategory'
import { roomBoundaryWalls } from '../floorplan/roomWallNames'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import {
  buildDaylightReport,
  DAYLIGHT_MIN_RATIO,
  exemptReason,
  isDaylightExempt,
  isExternalRoom,
  OPENABLE_FRACTION,
  VENT_MIN_RATIO,
} from './daylight'

/**
 * Synthetic plans for the daylight/ventilation maths. A room is a square in the
 * XZ plane; its north wall (z = origin.z) is shared with the outside, and a
 * window on that wall lights the room. Window glazing = width × (head − sill).
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

function plan(rooms: PlanRoom[], walls: PlanWall[], openings: PlanOpening[]): FloorPlan {
  return {
    id: 'test-plan',
    name: 'Test',
    ceilingHeight: 2.8,
    extent: [20, 20],
    walls,
    openings,
    rooms,
  }
}

describe('daylight thresholds', () => {
  it('exposes the rule-of-thumb constants', () => {
    expect(DAYLIGHT_MIN_RATIO).toBeCloseTo(0.1)
    expect(VENT_MIN_RATIO).toBeCloseTo(0.05)
    expect(OPENABLE_FRACTION).toBeCloseTo(0.5)
  })
})

describe('buildDaylightReport — single room', () => {
  // 4×4 room (16 m² floor) whose north wall (z=0) carries one window.
  const room = rectRoom('living', 'Living', 0, 0, 4)
  const wall = hWall('w-n', 0, 0, 4)

  it('computes glazing area = width × (head − sill) and the percentages', () => {
    // 2 m wide × (2.1 − 0.1) = 4 m² glazing on a 16 m² floor → 25% glazing.
    const report = buildDaylightReport(plan([room], [wall], [win('win', 'w-n', 1, 2, 0.1, 2.1)]))
    expect(report.rooms).toHaveLength(1)
    const r = report.rooms[0]
    expect(r.floorArea).toBeCloseTo(16)
    expect(r.glazingArea).toBeCloseTo(4)
    expect(r.glazingPct).toBeCloseTo(4 / 16)
    // Openable = 50% of glazing → 2 m² → vent % = 2/16 = 12.5%.
    expect(r.ventPct).toBeCloseTo(2 / 16)
    expect(r.daylightPass).toBe(true)
    expect(r.ventPass).toBe(true)
  })

  it('fails daylight when glazing is below 10% of the floor', () => {
    // 0.5 m × (1.2 − 0.9) = 0.15 m² glazing on 16 m² → ~0.94% → fails both.
    const report = buildDaylightReport(plan([room], [wall], [win('win', 'w-n', 1, 0.5, 0.9, 1.2)]))
    const r = report.rooms[0]
    expect(r.glazingPct).toBeLessThan(DAYLIGHT_MIN_RATIO)
    expect(r.daylightPass).toBe(false)
    expect(r.ventPass).toBe(false)
  })

  it('passes both at exactly the daylight threshold (vent is half of glazing)', () => {
    // Glazing exactly 10% of the 16 m² floor = 1.6 m² → daylight passes; openable
    // is half (OPENABLE_FRACTION) → 0.8 m² = 5% = exactly the vent threshold.
    const report = buildDaylightReport(plan([room], [wall], [win('win', 'w-n', 1, 1.6, 0, 1)]))
    const r = report.rooms[0]
    expect(r.glazingPct).toBeCloseTo(0.1)
    expect(r.daylightPass).toBe(true)
    expect(r.ventPct).toBeCloseTo(0.05)
    expect(r.ventPass).toBe(true)
  })

  it('a room with no windows fails both checks', () => {
    const report = buildDaylightReport(plan([room], [wall], []))
    const r = report.rooms[0]
    expect(r.glazingArea).toBe(0)
    expect(r.glazingPct).toBe(0)
    expect(r.daylightPass).toBe(false)
    expect(r.ventPass).toBe(false)
    expect(report.passCount).toBe(0)
    expect(report.failCount).toBe(1)
    expect(report.allPass).toBe(false)
  })

  it('sums multiple windows on the bounding wall', () => {
    const report = buildDaylightReport(
      plan(
        [room],
        [wall],
        [
          win('w1', 'w-n', 0.5, 1, 0, 2), // 2 m²
          win('w2', 'w-n', 2.0, 1, 0, 2), // 2 m²
        ],
      ),
    )
    expect(report.rooms[0].glazingArea).toBeCloseTo(4)
  })
})

describe('buildDaylightReport — multi-room attribution', () => {
  // Two stacked 4×4 rooms sharing geometry; each has its own north wall + window.
  const roomA = rectRoom('a', 'Room A', 0, 0, 4) // z in [0,4]
  const roomB = rectRoom('b', 'Room B', 0, 4, 4) // z in [4,8]
  const wallA = hWall('wa', 0, 0, 4) // north of A
  const wallB = hWall('wb', 0, 8, 4) // south of B

  it('attributes each window to the room its wall bounds', () => {
    const report = buildDaylightReport(
      plan(
        [roomA, roomB],
        [wallA, wallB],
        [
          win('wina', 'wa', 1, 2, 0, 2), // 4 m² → Room A
          win('winb', 'wb', 1, 1, 0, 1), // 1 m² → Room B
        ],
      ),
    )
    const a = report.rooms.find((r) => r.roomId === 'a')!
    const b = report.rooms.find((r) => r.roomId === 'b')!
    expect(a.glazingArea).toBeCloseTo(4)
    expect(b.glazingArea).toBeCloseTo(1)
    expect(a.daylightPass).toBe(true) // 4/16 = 25%
    expect(b.daylightPass).toBe(false) // 1/16 ≈ 6.25%
    expect(report.daylightPassCount).toBe(1)
  })
})

describe('buildDaylightReport — edge cases', () => {
  it('skips external / ledge rooms entirely', () => {
    const interior = rectRoom('living', 'Living', 0, 0, 4)
    const ledge = rectRoom('acLedge', 'AC Ledge', 4, 0, 2)
    const report = buildDaylightReport(plan([interior, ledge], [hWall('w', 0, 0, 4)], []))
    expect(report.rooms.map((r) => r.roomId)).toEqual(['living'])
  })

  it('ignores a window whose wall is missing', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4)
    const report = buildDaylightReport(
      plan([room], [hWall('w', 0, 0, 4)], [win('orphan', 'no-such-wall', 0, 2, 0, 2)]),
    )
    expect(report.rooms[0].glazingArea).toBe(0)
  })

  it('ignores a window that borders no interior room (purely external wall)', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4)
    // A far-away wall not adjacent to the room.
    const report = buildDaylightReport(
      plan([room], [hWall('far', 50, 50, 4)], [win('w', 'far', 0, 2, 0, 2)]),
    )
    expect(report.rooms[0].glazingArea).toBe(0)
  })

  it('handles a zero-area room without dividing by zero', () => {
    const degenerate: PlanRoom = { id: 'z', name: 'Zero', origin: [0, 0], width: 0, depth: 4 }
    const report = buildDaylightReport(
      plan([degenerate], [hWall('w', 0, 0, 4)], [win('w', 'w', 0, 2, 0, 2)]),
    )
    const r = report.rooms[0]
    expect(r.floorArea).toBe(0)
    expect(r.glazingPct).toBe(0)
    expect(r.daylightPass).toBe(false)
    expect(r.ventPass).toBe(false)
  })

  it('a plan with no rooms vacuously passes', () => {
    const report = buildDaylightReport(plan([], [], []))
    expect(report.rooms).toHaveLength(0)
    expect(report.allPass).toBe(true)
    expect(report.passCount).toBe(0)
  })

  it('floors negative/degenerate opening dimensions at zero', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4)
    // head below sill → negative span → 0 glazing.
    const report = buildDaylightReport(
      plan([room], [hWall('w', 0, 0, 4)], [win('w', 'w', 0, 2, 2, 1)]),
    )
    expect(report.rooms[0].glazingArea).toBe(0)
  })
})

describe('isExternalRoom', () => {
  it('flags ledge / balcony / external names but not habitable rooms', () => {
    expect(
      isExternalRoom({ id: 'acLedge', name: 'AC Ledge', origin: [0, 0], width: 1, depth: 1 }),
    ).toBe(true)
    expect(isExternalRoom({ id: 'b', name: 'Balcony', origin: [0, 0], width: 1, depth: 1 })).toBe(
      true,
    )
    expect(
      isExternalRoom({ id: 'living', name: 'Living', origin: [0, 0], width: 1, depth: 1 }),
    ).toBe(false)
  })
})

/**
 * `noFacade` — a room with no external wall can never gain a window, so a
 * daylight/ventilation shortfall there has no remedy and must not be advised.
 * The four walls of a square room are built explicitly so each fixture controls
 * its own `thickness` values.
 */
function boxWalls(
  prefix: string,
  x: number,
  z: number,
  side: number,
  thickness: PlanWall['thickness'],
): PlanWall[] {
  return [
    { id: `${prefix}-n`, start: [x, z], end: [x + side, z], thickness },
    { id: `${prefix}-e`, start: [x + side, z], end: [x + side, z + side], thickness },
    { id: `${prefix}-s`, start: [x + side, z + side], end: [x, z + side], thickness },
    { id: `${prefix}-w`, start: [x, z + side], end: [x, z], thickness },
  ]
}

describe('buildDaylightReport — noFacade', () => {
  const room = rectRoom('shelter', 'Household Shelter', 0, 0, 2)

  it('flags a room whose every bounding wall is internal', () => {
    const rows = buildDaylightReport(plan([room], boxWalls('s', 0, 0, 2, 'internal'), [])).rooms
    expect(rows).toHaveLength(1)
    expect(rows[0].noFacade).toBe(true)
    // The shortfall itself is still reported truthfully — only the ADVICE changes.
    expect(rows[0].daylightPass).toBe(false)
    expect(rows[0].ventPass).toBe(false)
  })

  it('does NOT flag a windowless room that touches the façade', () => {
    // Regression guard for a wrong first implementation: this test was written
    // against a version keyed on `wallHackability`, which maps an external wall
    // to load-bearing → NOT PERMITTED and so exempted this room. "Cannot be
    // demolished" is not "cannot hold a window" — measured on the template
    // corpus, that version suppressed the genuine windowless-Master-Bedroom
    // finding in `tpl-hdb-jumbo`.
    const walls = boxWalls('b', 0, 0, 2, 'external').map((w) => ({
      ...w,
      structure: 'load-bearing' as const,
    }))
    const rows = buildDaylightReport(plan([room], walls, [])).rooms
    expect(rows[0].noFacade).toBe(false)
    expect(rows[0].daylightPass).toBe(false)
  })

  it('does not flag a room with a single external wall among internal ones', () => {
    const walls = boxWalls('m', 0, 0, 2, 'internal')
    walls[0] = { ...walls[0], thickness: 'external' }
    expect(buildDaylightReport(plan([room], walls, [])).rooms[0].noFacade).toBe(false)
  })

  it('does not flag a room with no resolvable bounding walls', () => {
    // No walls at all is unknown, not proven-interior — stay conservative and
    // keep the advice rather than silently exempting a hand-built plan.
    expect(buildDaylightReport(plan([room], [], [])).rooms[0].noFacade).toBe(false)
  })
})

describe('buildDaylightReport — noFacade requires zero glazing', () => {
  // A 4×4 room ringed by INTERNAL walls, one of which nonetheless carries a
  // window. `hasNoFacade` alone would exempt it; real glazing proves otherwise.
  // Measured on the shipped default flat: `Bath/WC 2` is exactly this shape
  // (all-internal bounding walls, 7.4% glazing) and was wrongly shown as N/A.
  const room = rectRoom('bath2', 'Bath/WC 2', 0, 0, 4)
  const walls = boxWalls('b2', 0, 0, 4, 'internal')

  it('does not flag a room the window probe gives glazing to', () => {
    const rows = buildDaylightReport(
      plan([room], walls, [win('w1', 'b2-n', 1, 1.2, 0.9, 2.1)]),
    ).rooms
    expect(rows[0].glazingArea).toBeGreaterThan(0)
    expect(rows[0].noFacade).toBe(false)
  })

  it('still flags the same room once its window is removed', () => {
    // The fixture is not inert: strip the window and the exemption returns, so
    // the glazing guard is what the first assertion is measuring.
    const rows = buildDaylightReport(plan([room], walls, [])).rooms
    expect(rows[0].glazingArea).toBe(0)
    expect(rows[0].noFacade).toBe(true)
  })
})

describe('isDaylightExempt', () => {
  it('exempts only a room that needs no light and can get none', () => {
    const row = (noFacade: boolean, habitable: boolean, blastShelter = false) => ({
      noFacade,
      habitable,
      blastShelter,
    })
    expect(isDaylightExempt(row(true, false))).toBe(true)
    // Habitable + no façade is a layout defect, not an exemption.
    expect(isDaylightExempt(row(true, true))).toBe(false)
    // A room that CAN get light is always assessed.
    expect(isDaylightExempt(row(false, false))).toBe(false)
    expect(isDaylightExempt(row(false, true))).toBe(false)
    // A blast shelter is exempt unconditionally — even sitting on the façade,
    // where `noFacade` is false, because its RC walls may not be opened.
    expect(isDaylightExempt(row(false, false, true))).toBe(true)
  })

  it('marks an authored bedroom habitable and a store room not', () => {
    const walls = boxWalls('h', 0, 0, 4, 'internal')
    const rowFor = (category: 'bedroom' | 'storeroom') =>
      buildDaylightReport(plan([{ ...rectRoom('r', 'Room', 0, 0, 4), category }], walls, []))
        .rooms[0]
    expect(rowFor('bedroom').habitable).toBe(true)
    expect(isDaylightExempt(rowFor('bedroom'))).toBe(false)
    expect(rowFor('storeroom').habitable).toBe(false)
    expect(isDaylightExempt(rowFor('storeroom'))).toBe(true)
  })
})

describe('buildDaylightReport — a household shelter on the façade', () => {
  // The case the `'shelter'` RoomCategory exists for: 7 templates author the
  // shelter against an EXTERNAL wall, so the façade test alone left them
  // advising an opening that an RC blast shelter's walls prohibit.
  const walls = boxWalls('hs', 0, 0, 2, 'external')
  const rowFor = (name: string, category?: 'shelter' | 'storeroom') =>
    buildDaylightReport(plan([{ ...rectRoom('hs', name, 0, 0, 2), category }], walls, [])).rooms[0]

  it('is exempt even though it has a façade wall', () => {
    const row = rowFor('Household Shelter')
    expect(row.noFacade).toBe(false) // it genuinely touches the façade
    expect(row.blastShelter).toBe(true)
    expect(isDaylightExempt(row)).toBe(true)
  })

  it('resolves "Household Shelter" to the shelter category by name', () => {
    expect(rowFor('Household Shelter').blastShelter).toBe(true)
    expect(rowFor('HS').blastShelter).toBe(true)
  })

  it('does NOT exempt a plain store room on the façade', () => {
    // The fixture is not inert: same geometry, storeroom category → still
    // assessed, because a store room's wall CAN take a window.
    const row = rowFor('Store', 'storeroom')
    expect(row.blastShelter).toBe(false)
    expect(isDaylightExempt(row)).toBe(false)
  })
})

describe('exemptReason', () => {
  it('does not call a façade-side shelter an interior room', () => {
    // The two reasons are not interchangeable: a shelter on the façade HAS an
    // external wall, so the interior-room wording would state something false.
    expect(exemptReason({ noFacade: false, habitable: false, blastShelter: true })).toContain(
      'household shelter',
    )
    expect(exemptReason({ noFacade: false, habitable: false, blastShelter: true })).not.toContain(
      'interior room',
    )
    expect(exemptReason({ noFacade: true, habitable: false, blastShelter: false })).toContain(
      'interior room',
    )
  })
})

describe('shipped templates — shelter exemption is exercised, not incidental', () => {
  it('authors at least one shelter ON the façade', () => {
    // Guards the `daylight-shelter-facade` scenario (and the rule itself) from
    // going inert: if every shipped shelter were interior, `noFacade` alone
    // would exempt them all and the `'shelter'` category would be untested by
    // the corpus. Measured at the time of writing: 7 templates author it against
    // an external wall, which is realistic — an HDB shelter often forms part of
    // the façade.
    const onFacade = PLAN_TEMPLATES.flatMap((t) =>
      (t.rooms ?? [])
        .filter((r) => roomCategory(r) === 'shelter')
        .filter((r) => roomBoundaryWalls(t.walls ?? [], r).some((w) => w.thickness === 'external'))
        .map((r) => `${t.id}:${r.name}`),
    )
    expect(onFacade.length).toBeGreaterThan(0)
  })

  it('exempts every shipped household shelter', () => {
    const notExempt = PLAN_TEMPLATES.flatMap((t) =>
      buildDaylightReport(t)
        .rooms.filter((r) => r.blastShelter && !isDaylightExempt(r))
        .map((r) => `${t.id}:${r.roomName}`),
    )
    expect(notExempt).toEqual([])
  })
})
