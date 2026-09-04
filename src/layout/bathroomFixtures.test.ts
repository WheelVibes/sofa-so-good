import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * BATHROOM-FIXTURES ratchet (v0.31.9.14) — every furnished bathroom keeps its
 * basin and its WC.
 *
 * ## Why this exists
 *
 * `tpl-terrace-ground/ctu-mbath` lost its basin in v0.31.8.9.8, when giving
 * upper-storey doors their default swings created a keep-out the basin had been
 * sitting in. **Nothing failed.** The loss showed up only as
 * `diningChairTuck`'s per-template item count moving 120 -> 119, which needed a
 * per-def diff to interpret — and the GRAND total across the corpus was
 * unchanged, because a maisonette gain cancelled it exactly.
 *
 * A bathroom rendering with a mirror and no basin under it is a defect a
 * designer or contractor would reject on sight, and it deserves an assertion
 * that says so rather than a number that has to be decoded.
 *
 * ## What is measured
 *
 * Every `bath` / `powder` room across all 19 shipped templates and every storey,
 * furnished with the `move-in` preset: does a `bathroom-sink` and a `toilet`
 * stand inside it? 35 rooms today.
 *
 * **Do NOT add an entry to `KNOWN_NO_BASIN` to silence a failure.** Each entry is
 * a shipped plan whose bathroom cannot be fully fitted, which is a content
 * problem to fix at the source. Fixing one shows up here as a required edit.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')

/**
 * `tpl-terrace-ground`'s upper Master Bath, 1.5 x 2.4 m = 3.60 m².
 *
 * Diagnosed to exhaustion in v0.31.9.8 -> .12, including THREE wrong
 * explanations of mine: the door swing (it is `dropOverlaps` that deletes the
 * basin, not `dropDoorBlockers`), cornering the shower (measured on the raw room
 * rather than the inset rect), and `ROOM_INSET` (setting it to 0 still loses the
 * basin). What actually binds: a 0.9 m shower on the 1.5 m wall leaves 0.60 m,
 * and a 0.62 m basin misses that by 20 mm along the wall or leaves 100 mm of
 * standing room across it. Fixtures plus the door swing already claim 56% of the
 * floor.
 *
 * So this is a CONTENT limit — widen the room ~0.2 m, specify a 0.75 m quadrant
 * shower, or accept a two-fixture master bath. All three re-draw a shipped
 * Singapore layout, which is not a decision this test can make.
 */
const KNOWN_NO_BASIN = ['tpl-terrace-ground/ct-up/ctu-mbath']

interface Found {
  id: string
  areaM2: number
  has: string[]
}

function surveyBathrooms(): Found[] {
  const out: Found[] = []
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
    for (const level of planLevels(tpl)) {
      for (const room of level.rooms) {
        const cat = roomCategory(room)
        if (cat !== 'bath' && cat !== 'powder') continue
        const inRoom = items.filter(
          (it) =>
            (it.levelId ?? GROUND_LEVEL_ID) === level.id &&
            it.position[0] >= room.origin[0] &&
            it.position[0] <= room.origin[0] + room.width &&
            it.position[1] >= room.origin[1] &&
            it.position[1] <= room.origin[1] + room.depth,
        )
        out.push({
          id: `${tpl.id}/${level.id}/${room.id}`,
          areaM2: room.width * room.depth,
          has: inRoom.map((it) => it.defId).sort(),
        })
      }
    }
  }
  return out
}

describe('every furnished bathroom keeps its fixtures', () => {
  it('surveys the whole shipped corpus', () => {
    expect(movein).toBeDefined()
    // Guards the instrument: if the survey silently found nothing, the two
    // assertions below would both pass vacuously.
    expect(surveyBathrooms().length).toBe(35)
  }, 120_000)

  it('leaves no bathroom without a WC', () => {
    // No known offenders, deliberately stated as an empty expectation rather
    // than omitted — a WC is the one fixture a room cannot be a bathroom
    // without.
    const missing = surveyBathrooms()
      .filter((b) => !b.has.includes('toilet'))
      .map((b) => `${b.id} (${b.areaM2.toFixed(1)}m²) has: ${b.has.join(', ') || '(nothing)'}`)
    expect(missing).toEqual([])
  }, 120_000)

  it('matches the recorded basin-less bathrooms exactly', () => {
    const missing = surveyBathrooms()
      .filter((b) => !b.has.includes('bathroom-sink'))
      .map((b) => b.id)
    expect(missing).toEqual(KNOWN_NO_BASIN)
  }, 120_000)
})
