import { describe, expect, it } from 'vitest'
import { itemAabbBox } from '../collision/placement'
import { planLevels } from '../floorplan/levels'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { wallLength } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * WINDOW-SIGHTLINE (v0.31.5.117) — a floor piece taller than a window's sill
 * standing in front of the glass.
 *
 * `designRules.ts:windowSillTall`'s own doc says "a wardrobe, bookcase, or tall
 * cabinet taller than this shouldn't be pushed against a windowed wall", and
 * `tryPlace` does reject one inside `windowFrontRects`. But that rect is only
 * **0.65 m** deep — a walking band. A 2.1 m wardrobe clears it by centimetres
 * and then stands ~0.8 m from the glass covering most of it.
 *
 * A RATCHET. Three levers have been measured against it:
 *   - A DEEPER keep-out prism (`.117`): 11 -> 3 but **dropped 5 wardrobes**; the
 *     relaxed variant kept them and put the two worst offenders back. Reverted.
 *   - A NARROWER wardrobe (`.121`): width 1.2 gives 12 -> 10 but resizes every
 *     wardrobe in every template; width 1.0 goes back to **12**, because two more
 *     wardrobes then fit and block other windows. Not shipped.
 *   - **Preferring WINDOWLESS walls for tall STORAGE (`.121`, shipped):**
 *     12 -> 11 with item and wardrobe counts unchanged. A preference, not a
 *     prohibition, so nothing can go unplaced. Scoped to the `storage` role:
 *     applying it to every item taller than a sill cleared one more window but
 *     pushed BATHROOM FIXTURES off their walls, which `autoArrange.test.ts`
 *     caught and a sightline-only metric never would have.
 * The 11 that remain have no windowless wall with room — including both masters
 * that motivated the investigation. See `docs/open-graphics-decisions.md` (j).
 *
 * **Do NOT add an entry to silence a failure.** A new entry means a plan ships a
 * window with furniture parked in front of it.
 */
const KNOWN_BLOCKED = [
  'tpl-hdb-4room/h4-m-win: wardrobe-3door',
  // h5-b2-win CLEARED in v0.31.5.121 by preferring windowless walls for tall
  // storage — the wardrobe had a windowless alternative in that room.
  'tpl-hdb-5room/h5-m-win: wardrobe-3door',
  'tpl-hdb-exec/ex-b2-win: wardrobe-3door',
  // ADDED by v0.31.5.118, and an honest trade rather than a regression: fixing
  // (h) gave `ex-master` a window it never had AND restored the wardrobe that
  // had been dropped, so the room went from NO glass to glass partly blocked by
  // its own wardrobe. Third instance of item (j)'s pattern.
  'tpl-hdb-exec/ex-m-win: wardrobe-3door',
  'tpl-hdb-jumbo/jb-b4-win: wardrobe-3door',

  'tpl-hdb-maisonette/em-yard-win: wardrobe-3door',
  'tpl-condo-studio/su-bath-win: bathroom-sink',
]

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

/** Pieces whose footprint overlaps the glass laterally by ≥ 0.3 m and whose
 *  nearest face is within 1.2 m of the pane, on the room side. */
function blockedWindows() {
  const hits: string[] = []
  let windows = 0
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {}, false)
    for (const level of planLevels(tpl))
      for (const o of level.openings) {
        if (o.kind !== 'window') continue
        const wall = level.walls.find((w) => w.id === o.wallId)
        if (!wall) continue
        const len = wallLength(wall)
        if (!len) continue
        windows++
        const ux = (wall.end[0] - wall.start[0]) / len
        const uz = (wall.end[1] - wall.start[1]) / len
        const nx = -uz
        const nz = ux
        const ox = wall.start[0] + ux * o.offset
        const oz = wall.start[1] + uz * o.offset
        const sill = o.sill ?? 0.95
        for (const it of items) {
          const def = BUILTIN_CATALOG[it.defId]
          if (!def || def.mounted || def.noClip || def.windowBound) continue
          if (def.defaultFootprint.h <= sill) continue
          const b = itemAabbBox(it, def)
          let minA = Number.POSITIVE_INFINITY
          let maxA = Number.NEGATIVE_INFINITY
          let minP = Number.POSITIVE_INFINITY
          let maxP = Number.NEGATIVE_INFINITY
          for (const [px, pz] of [
            [b.minX, b.minZ],
            [b.maxX, b.minZ],
            [b.minX, b.maxZ],
            [b.maxX, b.maxZ],
          ] as const) {
            const a = (px - ox) * ux + (pz - oz) * uz
            const p = (px - ox) * nx + (pz - oz) * nz
            minA = Math.min(minA, a)
            maxA = Math.max(maxA, a)
            minP = Math.min(minP, p)
            maxP = Math.max(maxP, p)
          }
          if (Math.min(maxA, o.width) - Math.max(minA, 0) < 0.3) continue
          if (!(minP > 0.02 || maxP < -0.02)) continue
          if (Math.min(Math.abs(minP), Math.abs(maxP)) > 1.2) continue
          hits.push(`${tpl.id}/${o.id}: ${it.defId}`)
        }
      }
  }
  return { hits, windows }
}

describe('tall furniture does not stand in front of a window', () => {
  // Furnishes all 19 templates; well over vitest's 5 s default.
  it('matches the known-blocked list and adds none', { timeout: 30_000 }, () => {
    expect(blockedWindows().hits).toEqual(KNOWN_BLOCKED)
  })

  // Without this the list could pass by measuring nothing: 80 windows are
  // examined and 73 of them are clear.
  it('examines every template window', { timeout: 30_000 }, () => {
    const { hits, windows } = blockedWindows()
    // 79 from v0.31.8.29: the jumbo re-author added `jb-b3-win`, Bedroom 3's
    // first window of its own (item (h)); 80 from `.30`, where the 3Gen
    // re-author gave bedroom 2 its own window (`g3-b3-win` had been sitting in
    // bedroom 2, and `g3-m-win` in the kitchen).
    expect(windows).toBe(80)
    // 67 → 69: one more window examined (`jb-b3-win`) and one fewer blocked
    // (`jb-b5-win`, cleared because the jumbo re-author divided bedrooms 4/5).
    // 69 → 71 in `.30`: `g3-b2-win` added and `g3-liv-win` cleared, the living
    // room having been reshaped so a wardrobe no longer parks in front of it.
    // 71 → 72 in `.31`: `h3-b2-win` was sitting in the 3-room KITCHEN with the
    // refrigerator in front of it; moving it onto Bedroom 2's own wall cleared
    // the block as a side effect of fixing item (h).
    // 72 → 73 in `.34`: `tpl-1bed`'s living-room window is no longer blocked by
    // a potted plant, the room having gained a door for the arranger to work to.
    expect(windows - hits.length).toBe(73)
  })
})
