import { describe, expect, it } from 'vitest'
import { INTERIOR_AREA_M2 } from '../apartment/constants'
import { buildDefaultPlan } from './defaultPlan'
import { PLAN_TEMPLATES } from './templates'
import { planRoomArea, planTotalArea, wallLength } from './types'

describe('floor plan model', () => {
  it('builds a default plan from the fixed flat', () => {
    const plan = buildDefaultPlan()
    expect(plan.walls.length).toBeGreaterThan(10)
    expect(plan.rooms.length).toBeGreaterThan(5)
    expect(plan.openings.some((o) => o.kind === 'door')).toBe(true)
    expect(plan.openings.some((o) => o.kind === 'window')).toBe(true)
    expect(plan.ceilingHeight).toBeCloseTo(2.6, 6)
  })

  it('computes room and total areas (incl. L-shape extensions)', () => {
    expect(planRoomArea({ id: 'a', name: 'A', origin: [0, 0], width: 3, depth: 4 })).toBe(12)
    expect(
      planRoomArea({
        id: 'b',
        name: 'B',
        origin: [0, 0],
        width: 3,
        depth: 4,
        extension: { offset: [3, 0], width: 2, depth: 2 },
      }),
    ).toBe(16)
  })

  it("default plan's total area matches the fixed flat's interior area", () => {
    // buildDefaultPlan seeds every ROOM (incl. acLedge); INTERIOR_AREA_M2 sums
    // the non-external rooms. The plan total should be at least that.
    const total = planTotalArea(buildDefaultPlan())
    expect(total).toBeGreaterThanOrEqual(INTERIOR_AREA_M2 - 0.01)
  })

  it('measures wall length', () => {
    expect(wallLength({ id: 'w', start: [0, 0], end: [3, 4], thickness: 'internal' })).toBe(5)
  })
})

describe('plan templates', () => {
  it('each template is well-formed (unique ids, positive areas)', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.walls.length).toBeGreaterThanOrEqual(4)
      expect(tpl.rooms.length).toBeGreaterThan(0)
      expect(planTotalArea(tpl)).toBeGreaterThan(5)
      const wallIds = new Set(tpl.walls.map((w) => w.id))
      expect(wallIds.size).toBe(tpl.walls.length)
      // Every opening references a real wall in the template.
      for (const o of tpl.openings) {
        expect(tpl.walls.some((w) => w.id === o.wallId)).toBe(true)
      }
    }
  })
})
