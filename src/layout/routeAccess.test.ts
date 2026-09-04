import { describe, expect, it } from 'vitest'
import { findItemOverlaps } from '../collision/placement'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'
import { findFurnitureSeveredRooms } from './reachability'

/**
 * ROUTE-ACCESS ratchet (v0.31.8.52) — rooms the ARRANGER walls off.
 *
 * Each entry is a room that is walkable on the empty template and unreachable
 * once `furnishPlanItems` has placed the move-in layout: you cannot get into it
 * at all. These are the findings no gap threshold could produce — v0.31.8.51
 * measured why (dropping `walkway.ts`'s 0.40 m floor turned every
 * `sofa ↔ coffee-table` adjacency into a "blocked route" and halved the corpus's
 * circulation score), and `reachability.ts` answers the connectivity question
 * instead.
 *
 * **Do NOT add an entry to silence a failure.** A new entry means the arranger
 * has started sealing a room it used to leave open, which is a regression in the
 * thing this file exists to measure. Fixing one shows up here as a required
 * edit, which is the point.
 *
 * **Only CIRCULATION OBSTACLES (>= `OBSTACLE_AREA_M2`, 0.5 m²) can seal a room
 * (v0.31.8.53).** The first cut of this list counted every floor-standing piece
 * and so named `potted-plant`, `nightstand` and `floor-lamp` as things that
 * walled a room off. They are not — you step past a floor lamp. That correction
 * took the list from 32 findings to 22 and the clean templates from 5 to 10,
 * and it retracted v0.31.8.52's headline (`tpl-terrace-ground`'s master bedroom,
 * whose culprit was a 0.32 m² shoe cabinet).
 *
 * **`unsealRoutes` FIXES most of these (v0.31.8.55, widened .56).**
 * `furnishPlanItems` slides a sealing piece until the route opens, so this list
 * records what is LEFT: **43 rooms -> 3, across 10 templates -> 3.**
 *
 * The reach was the whole lever, and it was measured rather than guessed:
 * 1.2 m left 18 rooms, 1.8 m left 11, **2.4 m leaves 10**, and 3.0 m gains
 * nothing further. Moves stay small in practice because candidates are tried
 * nearest-first — the reach only decides how far the pass may go when nothing
 * closer works.
 *
 * **`tpl-condo-2bed`'s 8 were a TEMPLATE defect, fixed at the source in
 * v0.31.8.57.** Its front door sat at offset 1.0 on a wall that winds
 * south-to-north, which put it inside the 2.4 x 2.8 m Open Kitchen — whose only
 * other exit is a 1.1 m pass-through that the counter run and the fridge fill
 * once furnished. So the entry pocket WAS the kitchen and the other eight rooms
 * were unreachable. The unseal pass could not fix it: the counter's only clear
 * space is the kitchen's west strip, which is exactly where the front door's own
 * keep-out sits. Moving the door to offset 4.0 (z 3.85, inside Living / Dining)
 * took that template 8 -> 1 and broke nothing else in the suite.
 *
 * **What is left is three slivers, none of them a whole room** (0.6-1.5 m²), and
 * one of the three has no single culprit at all.
 *
 * **"Unreachable" means unreachable FROM THE FRONT DOOR (v0.31.8.54).** It used
 * to mean "not in the largest walkable region", which flips which SIDE of a seal
 * is reported: the old reading said `tpl-hdb-jumbo` lost only Bedroom 5, where
 * the truth is that its auto-furnished layout leaves a 5.7 m² pocket by the
 * front door reachable and the other ~55 m² not. That correction is why this
 * list went 22 -> 43 — the seals were always there, the anchor now reports the
 * side you actually cannot get to. ONE seal can therefore account for many rooms
 * (jumbo's 8, `tpl-condo-2bed`'s 8), so read this as a count of ROOMS BEYOND a
 * break, not a count of breaks.
 *
 * Rooms already unreachable on the EMPTY plan are excluded by construction — the
 * baseline is subtracted — so template-connectivity defects
 * (`tpl-hdb-4room`'s bedroom half has no interior door, recorded in
 * `templateConnectivity.test.ts` as `'tpl-hdb-4room/ground': 2`) are not counted
 * against the layout.
 */
const KNOWN_SEVERED: Record<string, number> = {
  /**
   * Bath 2.5 m², Kitchen 2.2, Shelter 1.4, Master Bedroom 0.9.
   *
   * This read `1` before v0.31.8.86 and the other three are a **correction, not
   * a regression**: `unsealRoutes` had been opening them by sliding a piece ON
   * TOP of another one. Its `trialFits` gate reads only the route raster, which
   * holds just the pieces big enough to obstruct, so anything under
   * `OBSTACLE_AREA_M2` was invisible to it — and a route that exists only
   * because a sofa is parked through a side table is not a route. Adding the
   * narrowphase clash gate took the whole corpus from **5 overlapping pairs to
   * 0** and made these three admit they were never reachable.
   */
  'tpl-hdb-2room': 4,
  /**
   * Dining 0.6 m², sealed by `coffee-table`.
   *
   * v0.31.8.86's disc DID open this one, and then gave it back: the coffee table
   * has to carry its satellites, and there is no offset where they all land
   * clear. Keeping it severed is the deliberate half of that trade — see the
   * satellite note below.
   */
  'tpl-1bed': 1,
  /**
   * Common Bath 1.5 m², and NO single culprit — it needs two pieces moved, so
   * the single-piece unseal pass cannot open it by construction. v0.31.8.86's
   * disc does not help: the limit is one-piece-at-a-time, not the search shape.
   */
  'tpl-condo-2bed': 1,
  /**
   * `emu-landing` 4.0 m², ADDED in v0.31.9.8 (DOOR-SWING-LEVELS) and a
   * CORRECTION, not a regression.
   *
   * Upper-storey doors carried NO swing until that release — `withInwardDoorSwings`
   * read the ground floor only — so nothing upstairs respected a door keep-out
   * and the landing appeared reachable because the furniture around it was
   * allowed to sit in the door swings. With the swings present, the arranger's
   * placements shift and the landing is genuinely cut off.
   *
   * It is the upper storey of the ONE template with a real upstairs circulation
   * space, which is why no other template moved.
   */
  'tpl-hdb-maisonette': 1,
  /**
   * Master 3.8 m², Common Bath 3.0, Master Bath 2.6, Bedroom 2 2.5 — the four
   * v0.31.8.86's disc claimed to open, RETURNED in v0.31.9.16 and a correction.
   *
   * That release opened them by sliding a `bed-single` (5.08, 5.00) ->
   * (7.33, 5.30): 2.25 m, out of `h5-bed3` and into `h5-living`. The item count
   * never moved, so nothing here saw it; it surfaced as "a bedroom with no bed"
   * in `roomCompleteness.test.ts`. `unsealRoutes` now refuses to slide a piece
   * out of the room it was arranged into, so these four are reported honestly
   * instead of being bought with a bed in the living room.
   */
  'tpl-hdb-5room': 4,
  /** Bedroom 4, 1.6 m² — same cause, same release. */
  'tpl-condo-4bed': 1,
}

/**
 * `tpl-hdb-5room`'s four rooms were FIXED in v0.31.8.86 by making the unseal
 * search a DISC instead of a cross. They needed a diagonal move out of a packed
 * corner, which ±X/±Z offsets can never find: of the 64 axis-aligned candidates,
 * 53 had nowhere to land and the other 11 landed still inside the pinch.
 *
 * The same release made the pass carry a moved piece's SATELLITES — the chairs of
 * a dining table. The disc had slid `tpl-hdb-maisonette`'s table ~1.5 m and left
 * three chairs 2.38 m behind it, which is precisely the defect
 * `diningChairTuck.test.ts` exists to catch. Carrying them costs `tpl-1bed`'s
 * Dining (no offset clears the table AND its satellites), and that trade is
 * deliberate: three chairs stranded around a spot the table no longer occupies is
 * a defect a user SEES, while a 0.6 m² unreachable sliver is one a check reports.
 */

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')

describe('route access — rooms the arranger walls off', () => {
  it('matches the recorded offenders exactly', () => {
    expect(movein).toBeDefined()
    const actual: Record<string, number> = {}
    const overlapping: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
      const n = findFurnitureSeveredRooms(items, BUILTIN_CATALOG, tpl).length
      if (n > 0) actual[tpl.id] = n
      for (const pair of findItemOverlaps(items, BUILTIN_CATALOG)) {
        const name = (id: string) => items.find((it) => it.id === id)?.defId ?? id
        overlapping.push(`${tpl.id}: ${name(pair.a)} x ${name(pair.b)}`)
      }
    }
    expect(actual).toEqual(KNOWN_SEVERED)
    /**
     * ZERO overlapping pairs, asserted HERE rather than in its own test because
     * this loop already furnishes all 19 templates and a second pass would
     * double the slowest test in the suite.
     *
     * This is the invariant that keeps the ratchet honest. Until v0.31.8.86 the
     * corpus carried 5 overlapping pairs, every one of them created by
     * `unsealRoutes` buying a route with a piece parked on top of another — so
     * "reachable" and "walkable" had quietly come apart. A future change that
     * improves the counts above by re-allowing that trade fails here instead of
     * looking like progress.
     */
    expect(overlapping).toEqual([])
    // 60 s, not the 10 s default: this furnishes all 19 templates AND runs two
    // rasters per template (empty baseline + furnished). It took ~10 s under
    // full-suite parallel load, which is exactly the boundary the default sits
    // on, so it is raised rather than left to flake.
  }, 60_000)

  it('leaves thirteen templates completely clean', () => {
    // Stated as its own assertion so a fix that "improves" the ratchet by
    // breaking a clean template cannot pass by trading one for another.
    const clean = PLAN_TEMPLATES.filter((t) => !(t.id in KNOWN_SEVERED)).map((t) => t.id)
    expect(clean.length).toBe(PLAN_TEMPLATES.length - Object.keys(KNOWN_SEVERED).length)
    expect(clean).toContain('tpl-condo-penthouse')
    // `tpl-hdb-maisonette` was the second sentinel until v0.31.9.8, when giving
    // its UPPER storey real door swings revealed `emu-landing` as genuinely cut
    // off. Replaced with `tpl-hdb-jumbo`, the hardest-won clean template on this
    // thread — 8 rooms behind one break at v0.31.8.52, all of them opened.
    expect(clean).toContain('tpl-hdb-jumbo')
  })
})
