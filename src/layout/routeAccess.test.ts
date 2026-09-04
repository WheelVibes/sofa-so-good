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
 * Rooms already unreachable on the EMPTY plan are excluded by construction — the
 * baseline is subtracted — so template-connectivity defects
 * (`tpl-hdb-4room`'s bedroom half has no interior door, recorded in
 * `templateConnectivity.test.ts` as `'tpl-hdb-4room/ground': 2`) are not counted
 * against the layout.
 */
const KNOWN_SEVERED: Record<string, number> = {
  'tpl-hdb-2room': 2, // Living / Dining 1.7, Master Bedroom 0.9
  'tpl-hdb-exec': 2, // Bedroom 2 Hall 1.6, Master Bedroom 0.7
  'tpl-hdb-jumbo': 1, // Bedroom 5 1.7
  'tpl-hdb-maisonette': 4, // Stair Landing 4.0, Stair Hall 3.8, Kitchen 3.3, Family Area 0.9
  'tpl-1bed': 2, // Kitchen 4.0, Dining 0.6
  'tpl-condo-2bed': 2, // Open Kitchen 2.6, Common Bath 1.5
  'tpl-condo-3bed': 1, // Master Bath 2.1
  'tpl-condo-4bed': 2, // Service Yard 2.5, Bedroom 4 1.6
  'tpl-condo-penthouse': 6, // Master Bath 5.6, Kitchen 5.4, Bedroom 2 4.2, Bedroom 3 3.6, Dining 2.8, Master Bedroom 1.7
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

  it('leaves ten templates completely clean', () => {
    // Stated as its own assertion so a fix that "improves" the ratchet by
    // breaking a clean template cannot pass by trading one for another.
    const clean = PLAN_TEMPLATES.filter((t) => !(t.id in KNOWN_SEVERED)).map((t) => t.id)
    expect(clean.sort()).toEqual(
      [
        'tpl-condo-1bed',
        'tpl-condo-1study',
        'tpl-condo-studio',
        'tpl-hdb-3gen',
        'tpl-hdb-3room',
        'tpl-hdb-4room',
        'tpl-hdb-5room',
        'tpl-loft',
        'tpl-studio',
        'tpl-terrace-ground',
      ].sort(),
    )
  })
})
