import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'
import { planRoomRect } from './arrangeGeometry'
import { footprintAabb } from './clearance'

/**
 * ROOM-OVERHANG ratchet (v0.31.9.22) — furniture that hangs OUT of its room.
 *
 * Each entry is a floor-standing piece whose footprint extends more than `TOL`
 * beyond the rectangle of the room its centre sits in. `src/layout/CLAUDE.md`
 * has recorded since v0.31.5.112 that "`tryPlace` has no notion of the room
 * rectangle" — it rejects walls, collisions and keep-outs, and a slot on an OPEN
 * edge can be perfectly legal while standing on the circulation floor beyond the
 * room, on a different floor finish. The chair-slot loop was guarded then. This
 * file measures how much of that is left everywhere else, which was never
 * counted. The ladder, all measured over the 19 templates in v0.31.9.22:
 *
 * | variant | overhangs |
 * |---|---|
 * | before this release | 12 |
 * | + along-wall sweep | 11 |
 * | + `settleInRect` containment (HELD BACK) | 7 |
 * | + `unsealRoutes` footprint containment | 6 |
 * | **as shipped** (sweep + unseal containment) | **10** |
 *
 * The sweep alone nets -1: it fixes two wardrobes sitting exactly on `TOL` and
 * adds one much worse offender — 0.49 m of `tpl-condo-2bed/c2-bed2`'s
 * `bed-single`, which the unseal containment then removes. The worst remaining
 * is 0.60 m of `tpl-condo-penthouse`'s TV console.
 *
 * `TOL` is 0.2 for the same geometric reason the chair-slot guard uses it: room
 * rects sit 0.1-0.2 m inside their wall CENTRELINES, so a few centimetres past
 * an edge is still within the room's own walls, while half a metre is
 * demonstrably on the floor next door.
 *
 * Two known sources, both identified by measurement rather than inspection:
 *
 * - **`settleInRect` bounds the CENTRE, not the extent.** It grid-searches
 *   `rect` inset 0.3 m and never asks how big the piece is, so a 1.90 m deep bed
 *   centred 0.46 m from the rect edge passes. Guarding it was built and measured
 *   in v0.31.9.22 — **11 -> 7**, the single biggest lever here — and held back
 *   because it strands dining chairs
 *   (two of `tpl-hdb-maisonette`'s settled 1.62 m and 4.21 m from their table).
 *   Nearest-first candidate ordering does not fix that. See the long comment on
 *   `settleInRect`.
 * - **`placeFlush`/`snapToWall` add `edgeShortfall` to the perpendicular
 *   offset**, deliberately pushing a piece OUT past the rect edge to meet the
 *   real wall face (v0.31.8.71). That is correct when there is a wall there and
 *   wrong when the nearest parallel wall belongs to another room.
 *
 * **Do NOT add an entry to silence a failure.** A new entry means a piece has
 * started standing outside the room it was arranged into, which is exactly what
 * this file exists to measure. Fixing one shows up here as a required edit.
 *
 * Rooms with an `extension` or an explicit `polygon` are excluded: `planRoomRect`
 * returns the primary rectangle / bounding box for those, so a piece correctly
 * placed in an L-shaped room's other wing would read as a false overhang.
 */
const TOL = 0.2

const KNOWN_OVERHANG = [
  '0.22 tpl-hdb-jumbo/jb-bed5 nightstand',
  '0.24 tpl-condo-1bed/c1-kit kitchen-counter-l',
  '0.24 tpl-hdb-5room/h5-master wardrobe-3door',
  '0.24 tpl-hdb-5room/h5-mbath bathroom-sink',
  '0.25 tpl-condo-penthouse/cp-living coffee-table',
  '0.29 tpl-1bed/ob-dining dining-table-4',
  '0.34 tpl-hdb-2room/h2-kit kitchen-counter-l',
  '0.40 tpl-condo-penthouse/cp-dining dining-table-4',
  '0.40 tpl-hdb-5room/h5-living dining-table-4',
  '0.60 tpl-condo-penthouse/cp-living tv-console',
]

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

function survey(): string[] {
  const found: string[] = []
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
    for (const level of planLevels(tpl)) {
      for (const r of level.rooms) {
        if (r.extension || r.polygon) continue
        const rect = planRoomRect(r)
        for (const it of items) {
          if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
          const [x, z] = it.position
          if (x < rect.x0 || x > rect.x1 || z < rect.z0 || z > rect.z1) continue
          const def = BUILTIN_CATALOG[it.defId]
          if (!def || def.mounted || def.noClip) continue
          const b = footprintAabb(it, def)
          const over = Math.max(rect.x0 - b.x0, b.x1 - rect.x1, rect.z0 - b.z0, b.z1 - rect.z1)
          if (over > TOL) found.push(`${over.toFixed(2)} ${tpl.id}/${r.id} ${it.defId}`)
        }
      }
    }
  }
  // Plain ascending sort so the comparison is order-stable; the numeric prefix
  // is zero-padded to two decimals, so this reads worst-last.
  return found.sort()
}

describe('room overhang — furniture standing outside its room', () => {
  it('matches the recorded offenders exactly', () => {
    const got = survey()
    if (process.env.OH_DUMP) throw new Error(JSON.stringify(got, null, 2))
    expect(got).toEqual(KNOWN_OVERHANG)
  }, 120_000)

  it('measures something — the survey is not vacuous', () => {
    /**
     * The first cut of this measurement read ZERO, and it was WRONG: it imported
     * `GROUND_LEVEL_ID` from `floorplan/types` (where only the TYPE lives, so
     * the value was `undefined`), which made the level filter reject every item
     * on every storey. A metric that passes because its loop body never runs is
     * the failure mode this whole thread keeps meeting, so the corpus size is
     * asserted alongside the findings.
     */
    let considered = 0
    for (const tpl of PLAN_TEMPLATES) {
      const items = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
      for (const level of planLevels(tpl))
        for (const it of items) if ((it.levelId ?? GROUND_LEVEL_ID) === level.id) considered++
    }
    expect(considered).toBeGreaterThan(1000)
  }, 120_000)
})
