import { describe, expect, it } from 'vitest'
import { wallBoxes } from './planGeometry'
import type { FloorPlan, PlanWall } from './types'

// A shed wall along +X, ramping 2.0 m (start) → 3.0 m (end), with a door.
const wall: PlanWall = {
  id: 'w',
  start: [0, 0],
  end: [4, 0],
  thickness: 'internal',
  topHeight: 2.0,
  topHeightEnd: 3.0,
}
const plan: FloorPlan = {
  id: 'p',
  name: 'T',
  extent: [4, 4],
  ceilingHeight: 3,
  rooms: [],
  walls: [wall],
  openings: [{ id: 'd', kind: 'door', wallId: 'w', offset: 1, width: 0.9, sill: 0, head: 2 }],
} as unknown as FloorPlan

describe('wallBoxes — openings on a sloped wall', () => {
  const boxes = wallBoxes(plan, wall)

  it('emits a solid lower band (no longer empty for sloped walls)', () => {
    expect(boxes.length).toBeGreaterThan(0)
  })

  it('caps the band at the wall’s MIN top height (2.0 m), not the high end (3.0 m)', () => {
    const maxTop = Math.max(...boxes.map((b) => b.cy + b.height / 2))
    expect(maxTop).toBeLessThanOrEqual(2.0 + 1e-6)
  })

  it('cuts a gap for the door (no solid box spans the door centre)', () => {
    const doorCentreX = 1.45 // offset 1 + width/2 0.45
    const covers = boxes.some(
      (b) => b.cx - b.length / 2 < doorCentreX && doorCentreX < b.cx + b.length / 2,
    )
    expect(covers).toBe(false)
  })
})
