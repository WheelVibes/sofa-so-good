import { describe, expect, it } from 'vitest'
import { planLevels } from './levels'
import { PLAN_TEMPLATES } from './templates'

/**
 * DOOR-SWING-LEVELS (F13, v0.31.9.8) — every door on every storey gets a default
 * inward swing.
 *
 * `withInwardDoorSwings` read `plan.walls`/`.openings` — the GROUND FLOOR — while
 * `templates/shared.ts` applies it to whole template plans. So upper-storey
 * doors were left with no `swing` at all, which means no swing arc on the
 * drawings and no swing rect for the clearance and keep-out checks: every
 * upstairs door was silently exempt from both.
 *
 * Before the fix the split was perfectly clean, which is the signature of a
 * ground-only transform: ground floors 0 doors missing a swing, upper storeys
 * ALL of them — maisonette 5/5, loft 2/2, terrace 6/6.
 */
describe('default door swings cover every storey', () => {
  const twoStorey = PLAN_TEMPLATES.filter((t) => planLevels(t).length > 1)

  it('has two-storey templates to check', () => {
    expect(twoStorey.map((t) => t.id).sort()).toEqual([
      'tpl-hdb-maisonette',
      'tpl-loft',
      'tpl-terrace-ground',
    ])
  })

  it('leaves no door without a swing, on any storey of any template', () => {
    const missing: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      for (const level of planLevels(tpl)) {
        for (const o of level.openings ?? []) {
          if (o.kind === 'door' && !o.swing) missing.push(`${tpl.id}/${level.id}/${o.id}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('still gives every UPPER storey door a swing specifically', () => {
    // Stated separately so a regression that drops upper-level handling cannot
    // hide behind a corpus that is mostly single-storey.
    for (const tpl of twoStorey) {
      const upper = planLevels(tpl).slice(1)
      const doors = upper.flatMap((l) => (l.openings ?? []).filter((o) => o.kind === 'door'))
      expect(doors.length, `${tpl.id} has no upper-storey doors to test`).toBeGreaterThan(0)
      expect(
        doors.every((o) => !!o.swing),
        `${tpl.id} upper doors missing swing`,
      ).toBe(true)
    }
  })
})
