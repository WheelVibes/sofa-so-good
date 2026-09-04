import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * FURNISH-VALIDITY invariant (v0.31.9.25) — the furnish path emits no
 * geometrically invalid item. Asserted at **ZERO**, with no allowlist.
 *
 * `arrangeCore` ends with `allItems.map((orig) => byId.get(orig.id) ?? orig)`,
 * so an item that neither the room routine nor the safety `settle` could place
 * keeps its ORIGINAL transform — the seed point, i.e. the room centre — and
 * until v0.31.9.25 nothing removed it. The arranger deliberately does not delete
 * (the same code powers the interactive "tidy", where deleting a user's
 * furniture is worse than leaving it put), so `furnishPlan`'s `dropUnplaceable`
 * closes it on the furnish side.
 *
 * **This reads 0 of 636 today and read 0 before the drop existed too.** It is a
 * guard, not a fix. It matters because of how v0.31.9.24 failed: four placement
 * levers worth room overhangs 10 -> 4 were reverted after one of them starved a
 * piece, and the failure surfaced as an INVALID item, which no ratchet on this
 * thread measures — the per-def counts all saw a piece that was still "there".
 * With this in place, that class can only appear as an item-count delta, which
 * `diningChairTuck.test.ts` already reads honestly.
 *
 * Uses the same `canPlace` the arranger's `tryPlace` uses, with the storey's
 * collision walls, so "survived the furnish" and "was legal to place" are one
 * rule. Judged in list order, mirroring `autoArrange.test.ts`'s own sweep, so a
 * single bad piece cannot condemn every later one.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

function survey(): { invalid: string[]; considered: number } {
  const invalid: string[] = []
  let considered = 0
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
    for (const level of planLevels(tpl)) {
      const walls = planCollisionWalls(levelAsPlan(tpl, level), {})
      if (walls.length === 0) continue
      const kept: typeof items = []
      for (const it of items) {
        if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
        const def = BUILTIN_CATALOG[it.defId]
        if (!def) continue
        if (def.mounted || def.noClip) {
          kept.push(it)
          continue
        }
        considered++
        if (canPlace(it, def, { others: kept, defs: BUILTIN_CATALOG, doors: {}, walls })) {
          kept.push(it)
        } else {
          invalid.push(
            `${tpl.id}/${level.id} ${it.defId} @${it.position.map((n) => n.toFixed(2)).join(',')}`,
          )
        }
      }
    }
  }
  return { invalid: invalid.sort(), considered }
}

describe('furnish validity — no item is left standing in a wall', () => {
  it('emits nothing invalid', () => {
    expect(survey().invalid).toEqual([])
  }, 180_000)

  it('examines the whole corpus', () => {
    // Pinned for the same reason `roomOverhang`/`roomLighting` pin theirs: an
    // emptiness assertion passes just as happily when the loop body never runs,
    // which has now happened three times on this thread.
    //
    // 636, not the corpus's ~1460 items: mounts and rugs are exempt above
    // (`canPlace` is a floor predicate), and the decor/styling props that make up
    // most of the remainder are mounts on host surfaces. The first draft of this
    // assertion guessed >1000 from the item total and failed — which is the
    // check doing its job on itself.
    expect(survey().considered).toBeGreaterThan(600)
  }, 180_000)
})
