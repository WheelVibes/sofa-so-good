import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import { PLAN_TEMPLATES } from './templates'
import { type FloorPlan, planBounds, planRoomArea, wallLength } from './types'

const isFinitePair = (p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1])

// Every built-in starter plan + the move-in default — the data users actually
// load, so a malformed one is a broken first experience.
const PLANS: Array<[string, FloorPlan]> = [
  ...PLAN_TEMPLATES.map((p): [string, FloorPlan] => [`${p.category?.apartmentType ?? p.name}`, p]),
  ['default', buildDefaultPlan()],
]

describe('built-in floor plans', () => {
  it('ships the expected set of categorised templates', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(18)
    // Every template is categorised (drives the picker tree).
    for (const p of PLAN_TEMPLATES) {
      expect(p.category).toBeTruthy()
      expect(p.category?.housingType).toBeTruthy()
    }
  })

  describe.each(PLANS)('plan: %s', (_name, plan) => {
    it('has rooms, walls, and a positive extent', () => {
      expect(plan.rooms.length).toBeGreaterThan(0)
      expect(plan.walls.length).toBeGreaterThan(0)
      expect(plan.extent[0]).toBeGreaterThan(0)
      expect(plan.extent[1]).toBeGreaterThan(0)
      expect(plan.ceilingHeight).toBeGreaterThan(0)
    })

    it('every room has finite geometry + positive floor area', () => {
      for (const r of plan.rooms) {
        expect(isFinitePair(r.origin)).toBe(true)
        expect(r.width).toBeGreaterThan(0)
        expect(r.depth).toBeGreaterThan(0)
        expect(planRoomArea(r)).toBeGreaterThan(0)
      }
    })

    it('room ids are unique (the plan-unique invariant room-keyed consumers rely on)', () => {
      const ids = plan.rooms.map((r) => r.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('every wall has finite endpoints + positive length', () => {
      for (const w of plan.walls) {
        expect(isFinitePair(w.start)).toBe(true)
        expect(isFinitePair(w.end)).toBe(true)
        expect(wallLength(w)).toBeGreaterThan(0)
      }
    })

    it('every opening sits on an existing wall and fits within its length', () => {
      const byId = new Map(plan.walls.map((w) => [w.id, w]))
      for (const o of plan.openings) {
        const wall = byId.get(o.wallId)
        expect(wall, `opening ${o.id} references wall ${o.wallId}`).toBeTruthy()
        if (!wall) continue
        expect(o.offset).toBeGreaterThanOrEqual(0)
        expect(o.width).toBeGreaterThan(0)
        // Opening must not run off the end of its wall (small tolerance for rounding).
        expect(o.offset + o.width).toBeLessThanOrEqual(wallLength(wall) + 1e-6)
      }
    })

    it('has finite, positive bounds', () => {
      const [bx, bz] = planBounds(plan)
      expect(bx).toBeGreaterThan(0)
      expect(bz).toBeGreaterThan(0)
      expect(Number.isFinite(bx) && Number.isFinite(bz)).toBe(true)
    })
  })
})
