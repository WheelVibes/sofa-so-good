import { describe, expect, it } from 'vitest'
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
 * records what is LEFT: **43 rooms -> 10, across 10 templates -> 3.**
 *
 * The reach was the whole lever, and it was measured rather than guessed:
 * 1.2 m left 18 rooms, 1.8 m left 11, **2.4 m leaves 10**, and 3.0 m gains
 * nothing further. Moves stay small in practice because candidates are tried
 * nearest-first — the reach only decides how far the pass may go when nothing
 * closer works.
 *
 * What resists is **`tpl-condo-2bed` (8 rooms behind one `kitchen-counter-l`)**:
 * every position that would open the route puts the counter across a doorway,
 * and the pass refuses that. Plus one room each in `tpl-hdb-2room` and
 * `tpl-1bed`.
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
  'tpl-hdb-2room': 1,
  'tpl-1bed': 1,
  'tpl-condo-2bed': 8,
}

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')

describe('route access — rooms the arranger walls off', () => {
  it('matches the recorded offenders exactly', () => {
    expect(movein).toBeDefined()
    const actual: Record<string, number> = {}
    for (const tpl of PLAN_TEMPLATES) {
      const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
      const n = findFurnitureSeveredRooms(items, BUILTIN_CATALOG, tpl).length
      if (n > 0) actual[tpl.id] = n
    }
    expect(actual).toEqual(KNOWN_SEVERED)
    // 60 s, not the 10 s default: this furnishes all 19 templates AND runs two
    // rasters per template (empty baseline + furnished). It took ~10 s under
    // full-suite parallel load, which is exactly the boundary the default sits
    // on, so it is raised rather than left to flake.
  }, 60_000)

  it('leaves sixteen templates completely clean', () => {
    // Stated as its own assertion so a fix that "improves" the ratchet by
    // breaking a clean template cannot pass by trading one for another.
    const clean = PLAN_TEMPLATES.filter((t) => !(t.id in KNOWN_SEVERED)).map((t) => t.id)
    expect(clean.length).toBe(PLAN_TEMPLATES.length - Object.keys(KNOWN_SEVERED).length)
    expect(clean).toContain('tpl-condo-penthouse')
    expect(clean).toContain('tpl-hdb-maisonette')
  })
})
