import { describe, expect, it } from 'vitest'
import { levelAsPlan, levelOfRoom, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'

/**
 * AIRCON-LEVEL (F13, v0.31.9.4) — a condenser on an UPPER ledge must be checked
 * against its own storey's walls.
 *
 * `freeCondenserSpot` already filtered obstacles by level and said so in a
 * comment ("same-level obstacles only (collision is level-gated)"), while the
 * `ctx.walls` beside it were the ground-floor set passed once by `resetSlice`.
 * So the code asserted the invariant its own walls broke. Found by the
 * `planCollisionWalls` caller audit (v0.31.9.2), not by a test — nothing
 * exercised an upper-storey ledge.
 *
 * Like `tapeMeasureLevel.test.ts` this tests the PREMISE and the LEVER rather
 * than the private function: the fix is which storey the walls come from, and
 * the bug only exists if the two storeys' wall sets genuinely differ.
 */
describe('condenser placement is level-gated on walls too', () => {
  const twoStorey = PLAN_TEMPLATES.filter((t) => planLevels(t).length > 1)

  it('has two-storey templates to reason about', () => {
    expect(twoStorey.length).toBeGreaterThan(0)
  })

  it('every two-storey template has a DIFFERENT wall set per storey', () => {
    // Without this, passing the ground set upstairs would be harmless and the
    // fix would be theatre.
    const key = (ws: ReturnType<typeof planCollisionWalls>) =>
      ws
        .map((w) => `${w.ax.toFixed(2)},${w.az.toFixed(2)}-${w.bx.toFixed(2)},${w.bz.toFixed(2)}`)
        .sort()
        .join('|')
    for (const tpl of twoStorey) {
      const levels = planLevels(tpl)
      const sets = levels.map((l) => key(planCollisionWalls(levelAsPlan(tpl, l), {})))
      expect(new Set(sets).size, `${tpl.id} storeys share one wall set`).toBe(sets.length)
    }
  })

  it('resolves an upper-storey room to its own level, which is what selects the walls', () => {
    // `levelOfRoom` is the lever the fix keys on: a ledge in an upper room must
    // report that level, else it silently falls back to the ground walls.
    for (const tpl of twoStorey) {
      const upper = planLevels(tpl)[1]
      const room = upper?.rooms[0]
      if (!upper || !room) continue
      expect(levelOfRoom(tpl, room.id)?.id, `${tpl.id}/${room.id}`).toBe(upper.id)
    }
  })

  it('a ground-floor room still resolves to the ground level', () => {
    for (const tpl of twoStorey) {
      const ground = planLevels(tpl)[0]
      const room = ground?.rooms[0]
      if (!ground || !room) continue
      expect(levelOfRoom(tpl, room.id)?.id).toBe(ground.id)
    }
  })
})
