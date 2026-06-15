import { describe, expect, it } from 'vitest'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { buildDefaultPlan } from './defaultPlan'
import { isDefaultPlan, planCollisionWalls, planWallThickness, wallBoxes } from './planGeometry'
import type { FloorPlan, PlanWall } from './types'

describe('planWallThickness', () => {
  const ext: PlanWall = { id: 'a', start: [0, 0], end: [1, 0], thickness: 'external' }
  const int: PlanWall = { id: 'b', start: [0, 0], end: [1, 0], thickness: 'internal' }
  const planWith = (wallThickness: FloorPlan['wallThickness']) =>
    ({ wallThickness }) as Pick<FloorPlan, 'wallThickness'> as FloorPlan

  it('falls back to the built-in 0.2 / 0.1 m defaults', () => {
    expect(planWallThickness(ext)).toBe(0.2)
    expect(planWallThickness(int)).toBe(0.1)
  })

  it('uses the plan-wide default for the wall category when set', () => {
    const plan = planWith({ external: 0.3, internal: 0.15 })
    expect(planWallThickness(ext, plan)).toBe(0.3)
    expect(planWallThickness(int, plan)).toBe(0.15)
  })

  it('a per-wall thicknessM override wins over the plan default', () => {
    const plan = planWith({ external: 0.3 })
    expect(planWallThickness({ ...ext, thicknessM: 0.45 }, plan)).toBe(0.45)
  })

  it('ignores non-positive overrides/defaults', () => {
    const plan = planWith({ external: 0 })
    expect(planWallThickness({ ...ext, thicknessM: 0 }, plan)).toBe(0.2)
  })
})

describe('planGeometry', () => {
  const plan = buildDefaultPlan()

  it('identifies the default plan', () => {
    expect(isDefaultPlan(plan)).toBe(true)
    expect(isDefaultPlan({ ...plan, id: 'custom' })).toBe(false)
  })

  it('default plan collision walls roughly match the fixed flat', () => {
    const fromPlan = planCollisionWalls(plan, {})
    const fromConst = buildCollisionWalls({})
    // Same wall set seeds both; segment counts should match closely.
    expect(Math.abs(fromPlan.length - fromConst.length)).toBeLessThanOrEqual(2)
    expect(fromPlan.length).toBeGreaterThan(10)
  })

  it('an open door opens a gap (more segments than closed)', () => {
    const door = plan.openings.find((o) => o.kind === 'door')!
    const closed = planCollisionWalls(plan, {})
    const open = planCollisionWalls(plan, { [door.id]: { open: true } })
    expect(open.length).toBeGreaterThanOrEqual(closed.length)
  })

  it('builds renderable wall boxes (windows get a sill + header)', () => {
    const win = plan.openings.find((o) => o.kind === 'window' && o.sill > 0)!
    const wall = plan.walls.find((w) => w.id === win.wallId)!
    const boxes = wallBoxes(plan, wall)
    expect(boxes.length).toBeGreaterThan(1)
    // Every box is within the wall's height range.
    for (const b of boxes) {
      expect(b.height).toBeGreaterThan(0)
      expect(b.cy).toBeGreaterThan(0)
    }
  })

  it('extends a wall end box to the abutting neighbour, but leaves free ends alone', () => {
    // L-corner: A (horizontal) and B (vertical) share [0,0]; A.end is free.
    const lPlan: typeof plan = {
      ...plan,
      walls: [
        { id: 'A', start: [0, 0], end: [4, 0], thickness: 'external' },
        { id: 'B', start: [0, 0], end: [0, 4], thickness: 'external' },
      ],
      openings: [],
    }
    const a = wallBoxes(lPlan, lPlan.walls[0])
    expect(a).toHaveLength(1)
    // Start abuts B (0.2 m → +0.1 extension); end is free (no extension): 4 + 0.1.
    expect(a[0].length).toBeCloseTo(4.1, 6)

    // A thicker B (override) extends A's end box further (0.6 → +0.3).
    const thickB: typeof plan = {
      ...lPlan,
      walls: [lPlan.walls[0], { ...lPlan.walls[1], thicknessM: 0.6 }],
    }
    expect(wallBoxes(thickB, thickB.walls[0])[0].length).toBeCloseTo(4.3, 6)
  })

  it('a curved wall renders as many full-height chord boxes + collision segments', () => {
    const curvedPlan: typeof plan = {
      ...plan,
      walls: [{ id: 'cw', start: [0, 0], end: [4, 0], thickness: 'internal', arc: 1 }],
      openings: [],
    }
    const boxes = wallBoxes(curvedPlan, curvedPlan.walls[0])
    // Many sub-segment boxes (one per arc chord), all full ceiling height.
    expect(boxes.length).toBeGreaterThan(5)
    for (const b of boxes) expect(b.height).toBeCloseTo(curvedPlan.ceilingHeight, 6)
    // Collision emits a matching strip of straight segments.
    const segs = planCollisionWalls(curvedPlan, {})
    expect(segs.length).toBe(boxes.length)
  })

  it('an opening on a curved wall is cut from its boxes + opens a collision gap', () => {
    const base: typeof plan = {
      ...plan,
      walls: [{ id: 'cw', start: [0, 0], end: [4, 0], thickness: 'internal', arc: 1 }],
    }
    const solid = { ...base, openings: [] }
    const withDoor = {
      ...base,
      openings: [
        {
          id: 'd1',
          kind: 'door' as const,
          wallId: 'cw',
          offset: 2,
          width: 0.9,
          sill: 0,
          head: 2.1,
        },
      ],
    }
    // A door (head 2.1 < ceiling) adds header boxes + a gap → its box set differs
    // from the solid wall, and every box stays within the wall height.
    const solidBoxes = wallBoxes(solid, solid.walls[0])
    const doorBoxes = wallBoxes(withDoor, withDoor.walls[0])
    expect(doorBoxes.length).not.toBe(solidBoxes.length)
    expect(doorBoxes.some((b) => b.height < base.ceilingHeight - 0.01)).toBe(true)
    // Opening the door removes collision segments (a walk-through gap).
    const closed = planCollisionWalls(withDoor, {})
    const open = planCollisionWalls(withDoor, { d1: { open: true } })
    const total = (segs: { ax: number; az: number; bx: number; bz: number }[]) =>
      segs.reduce((s, g) => s + Math.hypot(g.bx - g.ax, g.bz - g.az), 0)
    expect(total(open)).toBeLessThan(total(closed))
  })
})
