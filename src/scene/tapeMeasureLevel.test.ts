import { describe, expect, it } from 'vitest'
import { itemsOnLevel, levelAsPlan, planLevels, walkLevel } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import type { FurnitureItem } from '../furniture/types'

/**
 * TAPE-LEVEL (F13, v0.31.9.3) — the tape must snap to ONE storey on both sides
 * of its candidate set.
 *
 * `TapeMeasure.snapClick` used to gather furniture corners from `st.items`
 * (every storey) but wall endpoints from `st.floorPlan`, whose `walls` are the
 * GROUND FLOOR — so measuring upstairs on a maisonette snapped to furniture that
 * is there and walls that are not. Found by the `planCollisionWalls` caller
 * audit in v0.31.8.99/.9.2, not by any test, because nothing exercised an upper
 * storey.
 *
 * This tests the LEVERS rather than the component: `snapClick` is a closure over
 * a pointer event inside an r3f tree, and the defect was never in the snap maths
 * — it was in which storey the two inputs came from.
 */
const maisonette = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-maisonette')

describe('tape measure snaps within one storey', () => {
  it('has a two-storey fixture to reason about', () => {
    expect(maisonette).toBeDefined()
    expect(planLevels(maisonette!).length).toBe(2)
  })

  it('gives the UPPER storey different walls from the ground floor', () => {
    // The premise of the bug: these two sets are genuinely different, so taking
    // one while showing the other is a real inconsistency and not a nicety.
    const levels = planLevels(maisonette!)
    const ground = planCollisionWalls(levelAsPlan(maisonette!, levels[0]!), {})
    const upper = planCollisionWalls(levelAsPlan(maisonette!, levels[1]!), {})
    expect(ground.length).toBeGreaterThan(0)
    expect(upper.length).toBeGreaterThan(0)
    const key = (ws: typeof ground) =>
      ws
        .map((w) => `${w.ax.toFixed(2)},${w.az.toFixed(2)}-${w.bx.toFixed(2)},${w.bz.toFixed(2)}`)
        .sort()
        .join('|')
    expect(key(upper)).not.toBe(key(ground))
  })

  it('walkLevel + itemsOnLevel select the SAME storey, which is the fix', () => {
    const levels = planLevels(maisonette!)
    const upperId = levels[1]!.id
    const items = [
      { id: 'g1', defId: 'x', position: [1, 1] },
      { id: 'u1', defId: 'x', position: [2, 2], levelId: upperId },
      { id: 'u2', defId: 'x', position: [3, 3], levelId: upperId },
    ] as unknown as FurnitureItem[]

    const level = walkLevel(maisonette!, upperId)
    expect(level.id).toBe(upperId)
    // Items narrowed to the same storey the walls come from.
    expect(itemsOnLevel(items, level.id).map((i) => i.id)).toEqual(['u1', 'u2'])
    // And the ground item is excluded — it was previously a snap candidate while
    // standing upstairs.
    expect(itemsOnLevel(items, level.id).some((i) => i.id === 'g1')).toBe(false)
  })

  it("resolves viewLevelId 'all' to the ground floor, matching the camera", () => {
    // `walkLevel(plan, 'all')` walks the ground floor (levels.ts), so the tape
    // agrees with FirstPersonCamera by construction rather than by guessing.
    expect(walkLevel(maisonette!, 'all').id).toBe(planLevels(maisonette!)[0]!.id)
  })
})
