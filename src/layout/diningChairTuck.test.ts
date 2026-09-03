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
      // 49 → 48 in v0.31.8.36: the living/dining trades its TV console for the
      // front door, which used to open into the BATHROOM. Its master gains a
      // wardrobe (it had none) now that its second, misplaced window is gone.
      'tpl-hdb-2room': 48,
      // 67 → 66 in v0.31.8.31: Bedroom 2 trades its wardrobe for its first
      // window (item (h)); its 2.0 m south wall cannot take both.
      'tpl-hdb-3room': 66,
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
      // 95 → 86 in v0.31.8.30, the 3Gen re-author. Verified by per-def diff, not
      // inferred: the east wing lost its bathroom (4 pieces) — it cannot hold a
      // furnishable bedroom AND an ensuite, see the template comment — and a
      // second common bath in the corridor replaces it, while the grandparent
      // suite and master both KEEP their queen beds. Two earlier layouts lost
      // one or both beds and were reshaped rather than ratcheted.
      'tpl-hdb-3gen': 86,
      // 120 → 116 in v0.31.8.29: the jumbo re-author divided bedrooms 4 and 5
      // (one undivided volume before) and shrank the master from a rectangle
      // that overran the corridor wall and both baths, 11.5 → 6.9 m². Fewer,
      // honestly-sized rooms hold fewer pieces; the master keeps its queen bed
      // (an earlier L-shaped attempt lost it — no leg was 2.0 m deep).
      'tpl-hdb-jumbo': 116,
      // UNCHANGED at 141 through v0.31.8.33, which gave its kitchen, service yard
      // and STAIR HALL their first doors — on a maisonette the stair hall is the
      // only way to the upper storey. Putting the yard's door on the service
      // band's south wall rather than the yard's east wall kept every piece; the
      // east-wall version cost one AND pushed a cabinet in front of the window.
      'tpl-hdb-maisonette': 141,
      'tpl-studio': 23,
      // 46 until v0.31.5.112's room-bounds guard, which keeps one more 1-bed
      // chair alive by refusing it a slot outside the room (it had been placed
      // out there and then dropped).
      // 47 → 48 in v0.31.8.34: the bedroom/kitchen group gained its first door.
      'tpl-1bed': 48,
      'tpl-loft': 44,
      'tpl-condo-1bed': 44,
      'tpl-condo-1study': 53,
      // 68 → 67 in `.34`: bedroom 2's new door costs it a wardrobe. Its master
      // KEEPS its queen bed and the kitchen its counter and stove — mid-wall
      // doors lost all three, so they moved to the wall ends and the "Open
      // Kitchen" got a 1.1 m pass-through instead of a door.
      'tpl-condo-2bed': 67,
      // 80 → 81 in v0.31.8.33: the balcony parapet now MEETS the walls at both
      // ends (it stopped 0.1 m short, a stray-wall warning), so the balcony is a
      // real enclosure and furnishes properly.
      'tpl-condo-3bed': 81,
      'tpl-condo-4bed': 95,
      'tpl-condo-studio': 25,
      'tpl-condo-penthouse': 118,
      // 122 → 120 in `.34`, mostly redistribution once the car porch, dining and
      // kitchen got doors: dining and kitchen each gain one, the living and
      // service yard each lose one, and one piece that had been standing outside
      // every room is gone.
      'tpl-terrace-ground': 120,
    })
    const total = Object.values(counts).reduce((s, n) => s + n, 0)
    // 1437 before `.111`; 1439 after it; 1440 after `.112`'s room-bounds guard;
    // 1441 after `.115` restored the 4-room kitchen's range hood; 1442 after
    // `.116` restored the 5-room's; 1444 after `.118` restored the exec's hood
    // AND its master wardrobe. Every step up to here ADDED pieces.
    //
    // 1444 → 1440 in v0.31.8.29 is the FIRST step to reduce it, and it is a
    // room-geometry change rather than a placement failure: the jumbo re-author
    // divided bedrooms 4 and 5 (previously one undivided volume) and shrank a
    // master rectangle that had overrun the corridor wall and both baths,
    // 11.5 → 6.9 m². Verified by dumping the per-def diff, not inferred: the
    // master KEEPS its queen bed and its ensuite gained a shower and a second
    // basin; the four fewer pieces are a wardrobe and a desk in the smaller
    // bedrooms, plus one piece that had been standing outside every room.
    // An earlier L-shaped master DID lose the bed (`bed-queen` 2 → 1) — that is
    // what this assertion is for, and it was reshaped rather than ratcheted.
    //
    // 1440 → 1431 in `.30`, the 3Gen re-author, same character: its east wing
    // cannot hold a furnishable bedroom AND an ensuite (a `masterBedroom` kit
    // needs ~9-10 m² before pieces start dropping; the wing is 4.1 m wide), so
    // the bathroom there is replaced by one in the corridor. Both queen beds
    // survive — two earlier layouts lost one or both and were reshaped, not
    // ratcheted.
    //
    // 1431 → 1430 in `.31`, the 3-room re-author: one wardrobe, traded for
    // Bedroom 2's first window. Two bathrooms that had been open to the kitchen
    // and living room are now enclosed at no furniture cost — enclosing them at
    // their original 2.2 m² DID cost both a toilet and a basin, so they were
    // enlarged to 2.7-3.0 m² rather than ratcheted.
    // 1430 → 1431 in v0.31.8.33, an INCREASE: giving rooms that had no door one
    // costs nothing here, and closing `tpl-condo-3bed`'s balcony parapet (it
    // stopped 0.1 m short of the walls at both ends) makes that balcony a real
    // enclosure, which furnishes one piece better.
    //
    // 1431 → 1429 in `.34`, the second doors batch across seven more levels:
    // `tpl-1bed` +1, `tpl-condo-2bed` −1 (a wardrobe), `tpl-terrace-ground` −2
    // (mostly redistribution, including one piece that had been standing outside
    // every room). Every door offset here was placed at a wall END after
    // mid-wall versions cost a queen bed, a kitchen counter and stove, and a
    // washing machine — measured per-def, then moved rather than ratcheted.
    // 1429 → 1428 in `.36`: the 2-room's TV console, traded for a front door
    // that no longer opens into the bathroom.
    expect(total).toBe(1428)
  })

  // `tpl-hdb-2room` shipped FOUR dining chairs and no table — the table's ideal
  // spot was blocked, `tryPlace` returned it unplaced, and it was dropped.
  it('tpl-hdb-2room now gets the dining table its chairs belong to', () => {
    const items = furnish('tpl-hdb-2room')
    expect(items.filter((i) => i.defId.startsWith('dining-table'))).toHaveLength(1)
  })
})
