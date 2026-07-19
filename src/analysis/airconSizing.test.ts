import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import {
  BTU_PER_SQM,
  buildAirconSizing,
  CEILING_UPLIFT,
  OPEN_KITCHEN_BTU,
  ORIENTATION_UPLIFT,
  SYSTEM_SIZES,
} from './airconSizing'

/**
 * Synthetic plans for the BTU cooling-load maths. A room is a square in the XZ
 * plane; its four edge walls are declared explicitly so a test can mark just the
 * east/west wall external (to trigger the solar-gain uplift) while leaving the
 * others internal. `planRoomShell` clips a wall to the room when the wall sits on
 * a room-rect edge (within its collinearity tolerance), so every wall below is
 * placed exactly on an edge.
 */

function rectRoom(
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  extra: Partial<PlanRoom> = {},
): PlanRoom {
  return { id, name, origin: [x, z], width: w, depth: d, ...extra }
}

/** Horizontal wall (west→east) along z = `z`, from x to x+len. */
function hWall(id: string, x: number, z: number, len: number, t: PlanWall['thickness']): PlanWall {
  return { id, start: [x, z], end: [x + len, z], thickness: t }
}

/** Vertical wall (north→south) along x = `x`, from z to z+len. */
function vWall(id: string, x: number, z: number, len: number, t: PlanWall['thickness']): PlanWall {
  return { id, start: [x, z], end: [x, z + len], thickness: t }
}

/** The four edge walls of a square room `[x,z]` of side `s`; each side's
 *  thickness is chosen individually so a test can isolate the E/W-facing uplift. */
function squareWalls(
  prefix: string,
  x: number,
  z: number,
  s: number,
  sides: {
    n?: 'external' | 'internal'
    e?: 'external' | 'internal'
    s?: 'external' | 'internal'
    w?: 'external' | 'internal'
  } = {},
): PlanWall[] {
  return [
    hWall(`${prefix}-n`, x, z, s, sides.n ?? 'internal'),
    hWall(`${prefix}-s`, x, z + s, s, sides.s ?? 'internal'),
    vWall(`${prefix}-w`, x, z, s, sides.w ?? 'internal'),
    vWall(`${prefix}-e`, x + s, z, s, sides.e ?? 'internal'),
  ]
}

function door(id: string, wallId: string, offset: number, width: number): PlanOpening {
  return { id, kind: 'door', wallId, offset, width, sill: 0, head: 2.1 }
}

function plan(rooms: PlanRoom[], walls: PlanWall[], openings: PlanOpening[] = []): FloorPlan {
  return { id: 'test', name: 'Test', ceilingHeight: 2.8, extent: [40, 40], walls, openings, rooms }
}

describe('buildAirconSizing — base maths', () => {
  it('base BTU = floor area × BTU_PER_SQM with no modifiers', () => {
    // 4×4 = 16 m² room, all walls internal, default 2.8 m ceiling → no uplift.
    const report = buildAirconSizing(
      plan([rectRoom('r', 'Bedroom', 0, 0, 4, 4)], squareWalls('r', 0, 0, 4)),
    )
    expect(report.rooms).toHaveLength(1)
    const r = report.rooms[0]
    expect(r.floorArea).toBeCloseTo(16)
    expect(r.baseBtu).toBeCloseTo(16 * BTU_PER_SQM) // 9600
    expect(r.appliedModifiers).toEqual({
      orientation: false,
      ceiling: false,
      openKitchen: false,
      openKitchenBtu: 0,
    })
    expect(r.recommendedBtu).toBe(9600)
    // Smallest standard size ≥ 9600 is 12000.
    expect(r.systemBtu).toBe(12000)
    expect(r.needsMultipleUnits).toBe(false)
  })

  it('exposes the documented constants', () => {
    expect(BTU_PER_SQM).toBe(600)
    expect(ORIENTATION_UPLIFT).toBeCloseTo(0.15)
    expect(CEILING_UPLIFT).toBeCloseTo(0.2)
    expect(OPEN_KITCHEN_BTU).toBe(4000)
    expect(SYSTEM_SIZES).toEqual([9000, 12000, 18000, 24000])
  })
})

describe('buildAirconSizing — orientation (E/W solar-gain) uplift', () => {
  it('applies +15% when an EXTERIOR east wall faces due east at orientationDeg 0', () => {
    // Only the east wall is external → outward normal due-east (90°) → uplift.
    const walls = squareWalls('r', 0, 0, 4, { e: 'external' })
    const report = buildAirconSizing(plan([rectRoom('r', 'Living', 0, 0, 4, 4)], walls), 0)
    const r = report.rooms[0]
    expect(r.appliedModifiers.orientation).toBe(true)
    expect(r.recommendedBtu).toBe(Math.round(9600 * (1 + ORIENTATION_UPLIFT))) // 11040
    expect(r.systemBtu).toBe(12000)
  })

  it('does NOT apply the uplift when only a north wall is external (orientationDeg 0)', () => {
    const walls = squareWalls('r', 0, 0, 4, { n: 'external' })
    const report = buildAirconSizing(plan([rectRoom('r', 'Living', 0, 0, 4, 4)], walls), 0)
    expect(report.rooms[0].appliedModifiers.orientation).toBe(false)
    expect(report.rooms[0].recommendedBtu).toBe(9600)
  })

  it('rotates world bearings by orientationDeg — a north wall becomes E/W at 90°', () => {
    const walls = squareWalls('r', 0, 0, 4, { n: 'external' })
    // North (world bearing 0) + 90° North-orientation → true bearing 90 = due east.
    const report = buildAirconSizing(plan([rectRoom('r', 'Living', 0, 0, 4, 4)], walls), 90)
    expect(report.rooms[0].appliedModifiers.orientation).toBe(true)
  })
})

describe('buildAirconSizing — high-ceiling uplift', () => {
  it('applies +20% when ceiling height exceeds 3 m', () => {
    const room = rectRoom('r', 'Loft', 0, 0, 4, 4, { ceilingHeight: 3.2 })
    const report = buildAirconSizing(plan([room], squareWalls('r', 0, 0, 4)))
    const r = report.rooms[0]
    expect(r.appliedModifiers.ceiling).toBe(true)
    expect(r.recommendedBtu).toBe(Math.round(9600 * (1 + CEILING_UPLIFT))) // 11520
  })

  it('does not apply the uplift at exactly 3 m', () => {
    const room = rectRoom('r', 'Room', 0, 0, 4, 4, { ceilingHeight: 3 })
    const report = buildAirconSizing(plan([room], squareWalls('r', 0, 0, 4)))
    expect(report.rooms[0].appliedModifiers.ceiling).toBe(false)
  })

  it('falls back to the plan ceiling height when the room has none', () => {
    const tallPlan: FloorPlan = {
      ...plan([rectRoom('r', 'Room', 0, 0, 4, 4)], squareWalls('r', 0, 0, 4)),
      ceilingHeight: 3.5,
    }
    expect(buildAirconSizing(tallPlan).rooms[0].appliedModifiers.ceiling).toBe(true)
  })
})

describe('buildAirconSizing — combined uplifts', () => {
  it('stacks the orientation and ceiling uplifts additively', () => {
    const room = rectRoom('r', 'Living', 0, 0, 4, 4, { ceilingHeight: 3.5 })
    const walls = squareWalls('r', 0, 0, 4, { w: 'external' }) // west-facing → E/W uplift
    const report = buildAirconSizing(plan([room], walls), 0)
    const r = report.rooms[0]
    expect(r.appliedModifiers.orientation).toBe(true)
    expect(r.appliedModifiers.ceiling).toBe(true)
    // base × (1 + 0.15 + 0.20) = 9600 × 1.35 = 12960 → next size up 18000.
    expect(r.recommendedBtu).toBe(Math.round(9600 * 1.35))
    expect(r.systemBtu).toBe(18000)
  })
})

describe('buildAirconSizing — open kitchen', () => {
  // Living [0,0]–[4,4] and kitchen [4,0]–[8,4] share the vertical wall at x=4.
  const living = rectRoom('living', 'Living', 0, 0, 4, 4)
  const kitchen = rectRoom('kitchen', 'Kitchen', 4, 0, 4, 4)
  const sharedWall = vWall('shared', 4, 0, 4, 'internal')
  const otherWalls: PlanWall[] = [
    hWall('l-n', 0, 0, 4, 'internal'),
    hWall('l-s', 0, 4, 4, 'internal'),
    vWall('l-w', 0, 0, 4, 'internal'),
    hWall('k-n', 4, 0, 4, 'internal'),
    hWall('k-s', 4, 4, 4, 'internal'),
    vWall('k-e', 8, 0, 4, 'internal'),
  ]

  it('adds +4000 BTU to the LIVING room when a wide (≥1.8 m) opening joins an open kitchen', () => {
    const report = buildAirconSizing(
      plan([living, kitchen], [sharedWall, ...otherWalls], [door('pass', 'shared', 1, 2)]),
    )
    const l = report.rooms.find((r) => r.roomId === 'living')!
    const k = report.rooms.find((r) => r.roomId === 'kitchen')!
    expect(l.appliedModifiers.openKitchen).toBe(true)
    expect(l.appliedModifiers.openKitchenBtu).toBe(OPEN_KITCHEN_BTU)
    expect(l.recommendedBtu).toBe(9600 + OPEN_KITCHEN_BTU) // 13600 → 18000
    expect(l.systemBtu).toBe(18000)
    // The kitchen itself does NOT receive the add-on.
    expect(k.appliedModifiers.openKitchen).toBe(false)
    expect(k.recommendedBtu).toBe(9600)
  })

  it('does NOT add the open-kitchen load through a normal (narrow) door', () => {
    const report = buildAirconSizing(
      plan([living, kitchen], [sharedWall, ...otherWalls], [door('d', 'shared', 1, 0.9)]),
    )
    const l = report.rooms.find((r) => r.roomId === 'living')!
    expect(l.appliedModifiers.openKitchen).toBe(false)
    expect(l.recommendedBtu).toBe(9600)
  })
})

describe('buildAirconSizing — system-size rounding & overflow', () => {
  it('rounds up to the smallest standard size that fits', () => {
    // ~15 m² → 9000 base exactly → 9000 unit.
    const report = buildAirconSizing(
      plan([rectRoom('r', 'Room', 0, 0, 3, 5)], squareWalls('r', 0, 0, 3)),
    )
    // Note: squareWalls uses a single side; area comes from the room, not the walls.
    const r = report.rooms[0]
    expect(r.floorArea).toBeCloseTo(15)
    expect(r.recommendedBtu).toBe(9000)
    expect(r.systemBtu).toBe(9000)
  })

  it('flags needsMultipleUnits when the load exceeds the largest single unit', () => {
    // 50 m² → 30000 base > 24000.
    const report = buildAirconSizing(
      plan([rectRoom('r', 'Hall', 0, 0, 5, 10)], squareWalls('r', 0, 0, 5)),
    )
    const r = report.rooms[0]
    expect(r.recommendedBtu).toBe(30000)
    expect(r.systemBtu).toBe(24000)
    expect(r.needsMultipleUnits).toBe(true)
  })
})

describe('buildAirconSizing — edge cases', () => {
  it('skips external / ledge rooms', () => {
    const interior = rectRoom('living', 'Living', 0, 0, 4, 4)
    const ledge = rectRoom('acLedge', 'AC Ledge', 4, 0, 2, 2)
    const report = buildAirconSizing(plan([interior, ledge], squareWalls('living', 0, 0, 4)))
    expect(report.rooms.map((r) => r.roomId)).toEqual(['living'])
  })

  it('handles a zero-area room without NaN', () => {
    const degenerate = rectRoom('z', 'Zero', 0, 0, 0, 4)
    const report = buildAirconSizing(plan([degenerate], []))
    const r = report.rooms[0]
    expect(r.floorArea).toBe(0)
    expect(r.baseBtu).toBe(0)
    expect(r.recommendedBtu).toBe(0)
    expect(r.systemBtu).toBe(0)
    expect(r.needsMultipleUnits).toBe(false)
    expect(Number.isNaN(r.recommendedBtu)).toBe(false)
  })

  it('an empty plan yields no rows and zero totals', () => {
    const report = buildAirconSizing(plan([], []))
    expect(report.rooms).toHaveLength(0)
    expect(report.totalBtu).toBe(0)
    expect(report.totalSystemBtu).toBe(0)
    expect(Number.isNaN(report.totalBtu)).toBe(false)
  })

  it('tolerates a missing orientationDeg (defaults to 0) and undefined arrays', () => {
    const partial = {
      id: 'p',
      name: 'P',
      ceilingHeight: 2.8,
      extent: [10, 10],
    } as unknown as FloorPlan
    const report = buildAirconSizing(partial)
    expect(report.rooms).toHaveLength(0)
    expect(report.orientationDeg).toBe(0)
  })

  it('totals sum the per-room recommendations and system sizes', () => {
    const a = rectRoom('a', 'A', 0, 0, 4, 4)
    const b = rectRoom('b', 'B', 0, 5, 4, 4)
    const report = buildAirconSizing(
      plan([a, b], [...squareWalls('a', 0, 0, 4), ...squareWalls('b', 0, 5, 4)]),
    )
    expect(report.totalBtu).toBe(report.rooms.reduce((s, r) => s + r.recommendedBtu, 0))
    expect(report.totalSystemBtu).toBe(report.rooms.reduce((s, r) => s + r.systemBtu, 0))
  })
})
