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
 * Rooms already unreachable on the EMPTY plan are excluded by construction — the
 * baseline is subtracted — so template-connectivity defects
 * (`tpl-hdb-4room`'s bedroom half has no interior door, recorded in
 * `templateConnectivity.test.ts` as `'tpl-hdb-4room/ground': 2`) are not counted
 * against the layout.
 */
const KNOWN_SEVERED: Record<string, number> = {
  'tpl-hdb-2room': 1, // Living / Dining 0.6
  'tpl-hdb-3room': 3, // Kitchen 1.0, Household Shelter 0.9, Common Bath 0.5
  'tpl-hdb-4room': 2, // Kitchen 1.9, Household Shelter 1.3
  'tpl-hdb-5room': 3, // Kitchen 2.9, Balcony 2.5, Household Shelter 1.0
  'tpl-hdb-exec': 2, // Bedroom 2 Hall 1.6, Master Bedroom 0.6
  'tpl-hdb-jumbo': 2, // Bedroom 5 1.7, Master Bath 0.7
  'tpl-hdb-maisonette': 3, // Stair Hall 2.8, Stair Landing 2.6, Kitchen 2.0
  'tpl-1bed': 1, // Bathroom 0.9
  'tpl-condo-1bed': 1, // Living / Dining 4.0
  'tpl-condo-2bed': 3, // Master Closet 2.2, Open Kitchen 1.4, Master Bath 0.6
  'tpl-condo-3bed': 1, // Master Bath 1.0
  'tpl-condo-4bed': 2, // Balcony 3.4, Bedroom 4 1.4
  'tpl-condo-penthouse': 6, // Master Bath 4.5, Kitchen 3.8, Bedroom 2 3.6, Bedroom 3 3.3, Dining 1.3, Master Bedroom 1.3
  'tpl-terrace-ground': 2, // Master Bedroom 5.0, Service Yard 4.8
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

  it('leaves five templates completely clean', () => {
    // Stated as its own assertion so a fix that "improves" the ratchet by
    // breaking a clean template cannot pass by trading one for another.
    const clean = PLAN_TEMPLATES.filter((t) => !(t.id in KNOWN_SEVERED)).map((t) => t.id)
    expect(clean.sort()).toEqual(
      ['tpl-condo-1study', 'tpl-condo-studio', 'tpl-hdb-3gen', 'tpl-loft', 'tpl-studio'].sort(),
    )
  })
})
