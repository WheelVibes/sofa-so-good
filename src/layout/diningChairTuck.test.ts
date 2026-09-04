import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * DINING-PHANTOM (v0.31.5.111) — dining chairs must end up around their table.
 *
 * `tryPlace` reports failure by returning the item UNCHANGED, and both dining
 * routines used that return value as "where the table is". When the ideal spot
 * was blocked the chairs were slotted around the table's PRE-placement position,
 * and `arrangeCore`'s safety settle then moved the table elsewhere — stranding
 * the chairs around a spot the table never occupied. Measured before the fix:
 * 50 chairs over 1.2 m from their table across 15 templates, the worst 4.4 m.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** A 4-seat table tucks its chairs at ~0.90 m; the end slots sit at ~1.02 m. */
const TUCKED = 1.2

function furnish(id: string) {
  const tpl = PLAN_TEMPLATES.find((p) => p.id === id)
  if (!tpl) throw new Error(`no template ${id}`)
  return furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
}

describe('dining chairs are tucked to their table', () => {
  // Every template that the fix brings to ZERO stray chairs. Each of these had
  // strays before it (3room 3, 4room 4, exec 4, 3gen 4, maisonette 4), so the
  // test fails against the unfixed arranger — verified by reverting the lever.
  const CLEAN = [
    'tpl-hdb-3room',
    'tpl-hdb-4room',
    'tpl-hdb-exec',
    'tpl-hdb-3gen',
    'tpl-hdb-jumbo',
    'tpl-hdb-maisonette',
    'tpl-terrace-ground',
  ]

  for (const id of CLEAN) {
    it(`${id}: no dining chair strands from its table`, () => {
      const items = furnish(id)
      const tables = items.filter((i) => i.defId.startsWith('dining-table'))
      const chairs = items.filter((i) => i.defId === 'dining-chair')
      expect(tables.length).toBeGreaterThan(0)
      expect(chairs.length).toBeGreaterThan(0)
      const strays = chairs
        .map((c) => ({
          c,
          d: Math.min(...tables.map((t) => dist(c.position, t.position))),
        }))
        .filter((r) => r.d > TUCKED)
        .map((r) => `${r.c.position.map((n) => n.toFixed(2)).join(',')} @ ${r.d.toFixed(2)}m`)
      expect(strays).toEqual([])
    })
  }

  // A stranded chair is worse than a missing one, but a fix that quietly DELETES
  // furniture is worse than both — `.106` shipped a "stranded → 0" win while
  // dropping 7 items and only an item count caught it. These are the measured
  // post-fix totals; the two that changed did so because the dining table now
  // actually gets placed and occupies its footprint.
  // Furnishes all 19 templates twice; well over vitest's 5 s default.
  it('furnishes every template without losing pieces', { timeout: 30_000 }, () => {
    const counts = Object.fromEntries(
      PLAN_TEMPLATES.map((t) => [t.id, furnishPlanItems(t, movein, BUILTIN_CATALOG, {}).length]),
    )
    expect(counts).toEqual({
      'tpl-hdb-2room': 49,
      'tpl-hdb-3room': 64,
      // 76 until v0.31.5.115: moving the 4-room's misplaced window OUT of the
      // kitchen freed the wall the range hood needs, so the hood is no longer
      // dropped. Dumped per-def before touching this — the +1 is `range-hood`.
      'tpl-hdb-4room': 77,
      // 82 until v0.31.5.116: same story as the 4-room a version earlier —
      // moving the misplaced window OUT of the kitchen freed the wall the range
      // hood needs. Dumped per-def first; the +1 is `range-hood`.
      'tpl-hdb-5room': 83,
      // 91 until v0.31.5.118. Dumped per-def first: the +2 are a `range-hood`
      // (the stray kitchen window had been blocking the extractor's wall, the
      // same mechanism as `.115`/`.116`) and a `wardrobe-3door` — the exec
      // master's wardrobe had been dropped and now places.
      'tpl-hdb-exec': 93,
      'tpl-hdb-3gen': 96,
      'tpl-hdb-jumbo': 120,
      'tpl-hdb-maisonette': 141,
      'tpl-studio': 23,
      // 46 until v0.31.5.112's room-bounds guard, which keeps one more 1-bed
      // chair alive by refusing it a slot outside the room (it had been placed
      // out there and then dropped).
      'tpl-1bed': 47,
      'tpl-loft': 44,
      'tpl-condo-1bed': 44,
      'tpl-condo-1study': 53,
      'tpl-condo-2bed': 68,
      'tpl-condo-3bed': 80,
      'tpl-condo-4bed': 95,
      'tpl-condo-studio': 25,
      'tpl-condo-penthouse': 118,
      'tpl-terrace-ground': 122,
    })
    const total = Object.values(counts).reduce((s, n) => s + n, 0)
    // 1437 before `.111`; 1439 after it; 1440 after `.112`'s room-bounds guard;
    // 1441 after `.115` restored the 4-room kitchen's range hood; 1442 after
    // `.116` restored the 5-room's; 1444 after `.118` restored the exec's hood
    // AND its master wardrobe; 1448 after `v0.31.7.192` added windows for item (h) and the
    // arranger dressed them (+2 in `tpl-hdb-exec`, +2 in `tpl-hdb-3gen`).
    //
    // `tpl-hdb-jumbo` gained a window too and its count did NOT move (120 either way), so the
    // arranger does not dress every new window. Recorded rather than chased: it is an arranger
    // question, not a plan one, and the window itself is owned.
    //
    // ⚠️ `v0.31.7.193` BREAKS the "every step only adds" pattern, deliberately and in one place:
    // `tpl-hdb-3room` goes **67 → 66**. `h3-bed2`'s only viable span on an external wall is
    // 2.8–3.4 m — 0.6 m of freedom on a crowded wall in the smallest flat — so the new glass takes
    // wall space and the arranger drops one wall-hugging piece. That is the trade item (h) is
    // asking for: a bedroom with daylight and one fewer accessory. Every other template gained or
    // held.
    expect(total).toBe(1442)
  })

  // `tpl-hdb-2room` shipped FOUR dining chairs and no table — the table's ideal
  // spot was blocked, `tryPlace` returned it unplaced, and it was dropped.
  it('tpl-hdb-2room now gets the dining table its chairs belong to', () => {
    const items = furnish('tpl-hdb-2room')
    expect(items.filter((i) => i.defId.startsWith('dining-table'))).toHaveLength(1)
  })
})
