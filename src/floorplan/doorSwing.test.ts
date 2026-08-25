import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOOR_HINGE,
  DEFAULT_DOOR_SWING,
  defaultDoorSwing,
  doorHinge,
  doorPlanSymbol,
  doorSwing,
  doorSwingClearRect,
  doorSwingGeometry,
  isDoubleDoor,
  isSlidingDoor,
  servedRoom,
  slidingParkDir,
  swingForPhysicalSide,
  withInwardDoorSwings,
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
  it('sliding door contributes NO swing keep-out (null → only the approach strip)', () => {
    expect(doorSwingClearRect(wall, { ...base, style: 'sliding' })).toBeNull()
  })
  it('double door keep-out is a conservative full-width rect (both quarters + gap)', () => {
    // Full opening width (x 1→2) × half-width depth (0.5) into the +Z swing side.
    const r = doorSwingClearRect(wall, { ...base, style: 'double' })!
    expect(r).toEqual({ x0: 1, z0: 0, x1: 2, z1: 0.5 })
  })
})

describe('door style predicates', () => {
  it('isSlidingDoor / isDoubleDoor key off the door style', () => {
    expect(isSlidingDoor({ ...base, style: 'sliding' })).toBe(true)
    expect(isSlidingDoor({ ...base, style: 'double' })).toBe(false)
    expect(isSlidingDoor(base)).toBe(false)
    expect(isDoubleDoor({ ...base, style: 'double' })).toBe(true)
    expect(isDoubleDoor({ ...base, style: 'sliding' })).toBe(false)
    // A window that happens to carry the string is never a door.
    expect(isSlidingDoor({ ...base, kind: 'window', style: 'sliding' })).toBe(false)
  })
})

describe('doorPlanSymbol', () => {
  it('a single-leaf door yields one swing leaf at the full width', () => {
    const sym = doorPlanSymbol(wall, base)!
    expect(sym.kind).toBe('swing')
    if (sym.kind !== 'swing') throw new Error('expected swing')
    expect(sym.leaves).toHaveLength(1)
    const lf = sym.leaves[0]!
    expect(lf.radius).toBe(1)
    expect(lf.hinge).toEqual([1, 0])
    expect(lf.leafTip).toEqual([1, 1])
  })
  it('a double door yields two half-width leaves hinged at both jambs', () => {
    const sym = doorPlanSymbol(wall, { ...base, style: 'double' })!
    expect(sym.kind).toBe('swing')
    if (sym.kind !== 'swing') throw new Error('expected swing')
    expect(sym.leaves).toHaveLength(2)
    expect(sym.leaves[0]!.radius).toBe(0.5)
    expect(sym.leaves[1]!.radius).toBe(0.5)
    // Hinged at the two jambs; both tips reach the +Z swing side.
    expect(sym.leaves[0]!.hinge).toEqual([1, 0])
    expect(sym.leaves[1]!.hinge).toEqual([2, 0])
    expect(sym.leaves[0]!.leafTip).toEqual([1, 0.5])
    expect(sym.leaves[1]!.leafTip).toEqual([2, 0.5])
  })
  it('a sliding door yields a leaf bar + slide arrow (no swing arc)', () => {
    const sym = doorPlanSymbol(wall, { ...base, style: 'sliding' })!
    expect(sym.kind).toBe('sliding')
    if (sym.kind !== 'sliding') throw new Error('expected sliding')
    // Bar spans the opening, offset a hair to the +Z room side.
    expect(sym.bar[0]).toEqual([1, 0.06])
    expect(sym.bar[1]).toEqual([2, 0.06])
    // Arrow parks toward the roomier side; here both sides are equal (1 m) so it
    // ties to the wall start (−X).
    expect(sym.arrow[0][0]).toBeGreaterThan(sym.arrow[1][0])
  })
  it('slide arrow follows the roomier side, NOT the hinge (regression)', () => {
    // hinge=start but MORE free wall AFTER the opening (spaceAfter 1.5 > before
    // 0.5): the 3D leaf parks toward the wall END (+X). The old hinge-keyed arrow
    // pointed −X (toward the start jamb) — opposite the actual slide. The arrow
    // must now point +X to agree with `PlanDoorLeaf`'s `slidingParkDir`.
    const sym = doorPlanSymbol(wall, { ...base, offset: 0.5, style: 'sliding', hinge: 'start' })!
    if (sym.kind !== 'sliding') throw new Error('expected sliding')
    expect(sym.arrow[1][0]).toBeGreaterThan(sym.arrow[0][0])
  })
})

describe('slidingParkDir', () => {
  it('parks toward whichever adjacent segment has more room', () => {
    // Wall length 3, width 1: more room after → +1 (toward the wall end).
    expect(slidingParkDir(0.5, 1, 3)).toBe(1)
    // More room before → -1 (toward the wall start).
    expect(slidingParkDir(1.5, 1, 3)).toBe(-1)
    // Exact tie → -1 (toward the start).
    expect(slidingParkDir(1, 1, 3)).toBe(-1)
  })
})

// A named room, so the category classifier (bath / corridor / bedroom) applies.
const named = (
  id: string,
  name: string,
  origin: [number, number],
  w: number,
  d: number,
): PlanRoom => ({ ...room(id, origin, w, d), name })

describe('servedRoom', () => {
  it('picks the bath over the corridor it opens off', () => {
    const bath = named('b', 'Bath/WC 2', [0, 0], 2, 2)
    const corridor = named('c', 'Corridor', [0, -1.1], 4, 1.1)
    expect(servedRoom(bath, corridor)?.id).toBe('b')
    expect(servedRoom(corridor, bath)?.id).toBe('b')
  })
  it('picks the bedroom over the living/dining space', () => {
    const bed = named('b', 'Bedroom 2', [0, 0], 3, 3)
    const ld = named('l', 'Living / Dining', [0, -6], 6, 6)
    expect(servedRoom(bed, ld)?.id).toBe('b')
  })
  it('picks the smaller room when neither side is wet or circulation', () => {
    const small = named('s', 'Study', [0, 0], 2, 2)
    const big = named('g', 'Bedroom 1', [0, -4], 4, 4)
    expect(servedRoom(small, big)?.id).toBe('s')
  })
  it('is null for two indistinguishable rooms', () => {
    expect(
      servedRoom(named('a', 'Room A', [0, 0], 3, 3), named('b', 'Room B', [0, -3], 3, 3)),
    ).toBe(null)
  })
})

describe('defaultDoorSwing — both sides rooms', () => {
  it('opens into the bath, not the corridor', () => {
    // Bath on +Z (the 'right' normal of this +X wall), corridor on -Z.
    const plan = makePlan([
      named('bath', 'Bath/WC 2', [0, 0], 3, 2),
      named('cor', 'Corridor', [0, -1.2], 3, 1.2),
    ])
    expect(defaultDoorSwing(plan, wall, 1, 1)).toBe('right')
  })
  it('opens into the bath when the bath is on the -Z side', () => {
    const plan = makePlan([
      named('cor', 'Corridor', [0, 0], 3, 1.2),
      named('bath', 'Bath/WC 1', [0, -2], 3, 2),
    ])
    expect(defaultDoorSwing(plan, wall, 1, 1)).toBe('left')
  })
})

describe('swingForPhysicalSide', () => {
  it('passes a start-hinged side through', () => {
    expect(swingForPhysicalSide('right', 'start')).toBe('right')
    expect(swingForPhysicalSide('left', 'start')).toBe('left')
  })
  it('flips an end-hinged side (the hinge is folded into the swing sign)', () => {
    expect(swingForPhysicalSide('right', 'end')).toBe('left')
    expect(swingForPhysicalSide('left', 'end')).toBe('right')
  })
  it('round-trips to the intended physical normal for BOTH hinges', () => {
    // The +Z normal of this +X wall is the 'right' side.
    for (const hinge of ['start', 'end'] as const) {
      const o: PlanOpening = { ...base, hinge, swing: swingForPhysicalSide('right', hinge) }
      const g = doorSwingGeometry(wall, o)
      expect(g?.normal).toEqual([0, 1])
    }
  })
})

describe('withInwardDoorSwings', () => {
  const bathPlan = (hinge: 'start' | 'end') => ({
    ...makePlan([
      named('bath', 'Bath/WC 2', [0, 0], 3, 2),
      named('cor', 'Corridor', [0, -1.2], 3, 1.2),
    ]),
    openings: [{ ...base, hinge }],
  })

  it('fills the swing so the leaf lands inside the bath (start hinge)', () => {
    const filled = withInwardDoorSwings(bathPlan('start'))
    expect(filled.openings[0].swing).toBe('right')
    expect(doorSwingGeometry(wall, filled.openings[0])?.normal).toEqual([0, 1])
  })
  it('fills the swing so the leaf lands inside the bath (end hinge)', () => {
    const filled = withInwardDoorSwings(bathPlan('end'))
    expect(filled.openings[0].swing).toBe('left')
    expect(doorSwingGeometry(wall, filled.openings[0])?.normal).toEqual([0, 1])
  })
  it('leaves an explicit swing alone and returns the same plan when nothing to fill', () => {
    const plan = { ...bathPlan('start'), openings: [{ ...base, swing: 'left' as const }] }
    expect(withInwardDoorSwings(plan)).toBe(plan)
  })
  it('ignores windows', () => {
    const plan = {
      ...bathPlan('start'),
      openings: [{ ...base, kind: 'window' as const, sill: 0.9, head: 2.1 }],
    }
    expect(withInwardDoorSwings(plan)).toBe(plan)
  })
})
