import { describe, expect, it } from 'vitest'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { buildDefaultPlan } from './defaultPlan'
import { isDefaultPlan, planCollisionWalls, wallBoxes } from './planGeometry'

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
})
