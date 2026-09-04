import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import type { RoomCategory } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * ROOM-COMPLETENESS ratchet (v0.31.9.15) — a room must contain the fixture that
 * makes it that kind of room.
 *
 * ## Why this exists
 *
 * `bathroomFixtures.test.ts` (v0.31.9.14) was written because `ctu-mbath` lost
 * its basin and **nothing failed** — it showed up only as a per-template item
 * count moving by one, inside a corpus total that cancelled out. Surveying the
 * other room types the same way found the failure mode is not confined to
 * bathrooms:
 *
 *   - **2 of 44 bedrooms contain no bed.** Both are ~9 m², so this is a
 *     placement failure and not a capacity limit. `tpl-hdb-3gen/g3-gen` has TWO
 *     NIGHTSTANDS flanking a bed that is not there.
 *   - **5 of 18 kitchens are missing a hob, a fridge or a counter.**
 *
 * "A bedroom with no bed" is the least defensible output an interior-design tool
 * can produce, and until this test nothing in the suite said so.
 *
 * ## Relationship to the existing ratchets
 *
 * `applianceWall.test.ts` already tracks the four templates whose range hood has
 * no stove under it (`KNOWN_ORPHAN_HOODS`). This test is broader and catches what
 * that one cannot: those kitchens are ALSO missing fridges and counters, and
 * `tpl-condo-1bed` is missing only a fridge — it HAS a stove, so it never
 * appears in the hood ratchet at all.
 *
 * **Do NOT add entries to silence a failure.** Each one is a shipped plan that
 * furnishes a room without the thing it exists for.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')

/** Any one of these satisfies the requirement. */
interface Requirement {
  label: string
  anyOf: string[]
}

const REQUIREMENTS: Partial<Record<RoomCategory, Requirement[]>> = {
  bedroom: [{ label: 'a bed', anyOf: ['bed-single', 'bed-queen', 'bed-king', 'bed-double'] }],
  masterBedroom: [{ label: 'a bed', anyOf: ['bed-single', 'bed-queen', 'bed-king', 'bed-double'] }],
  kitchen: [
    { label: 'a hob', anyOf: ['stove'] },
    { label: 'a fridge', anyOf: ['refrigerator'] },
    { label: 'a counter', anyOf: ['kitchen-counter-l', 'kitchen-counter', 'kitchen-sink'] },
  ],
}

/**
 * `<template>/<level>/<room>: missing …` — every shipped room that furnishes
 * incomplete, with its area so a capacity excuse can be checked rather than
 * assumed.
 */
const KNOWN_INCOMPLETE = [
  // `tpl-hdb-5room/ground/h5-bed3` was here until v0.31.9.16. Its bed was never
  // missing — `unsealRoutes` had SLID it 2.25 m into `h5-living` to open a
  // route, which no item-count ratchet could see. Room containment fixed it.
  // `tpl-hdb-3gen/ground/g3-gen` was here until v0.31.9.17. Its door was centred
  // on the 3.56 m north wall, so the 0.90 m swing keep-out split it into 1.28 m
  // and 1.38 m runs — both 0.14 m short of a 1.52 m `bed-queen`, in every
  // orientation. Moving the door to the west jamb gave a 2.68 m run and the room
  // gained 8 pieces. The room was never too small.
  // The four hood-without-hob kitchens are already in `applianceWall.test.ts`'s
  // KNOWN_ORPHAN_HOODS; what that ratchet cannot see is that they are missing
  // the rest of the kitchen too.
  'tpl-1bed/ground/ob-kit: missing a hob, a fridge, a counter',
  'tpl-condo-1study/ground/cs-kit: missing a hob, a counter',
  // Counter recovered in v0.31.9.19 (FITTED-COUNTER) — it had been a 2.4 m run
  // in a room whose longest wall is 2.0 m, so it overflowed and was dropped.
  'tpl-condo-studio/ground/su-kit: missing a hob, a fridge',
  'tpl-studio/ground/st-kit: missing a hob, a fridge, a counter',
  // NOT in the hood ratchet — this one HAS a stove, so only the fridge is gone.
  'tpl-condo-1bed/ground/c1-kit: missing a fridge',
]

function survey(): { incomplete: string[]; counts: Partial<Record<RoomCategory, number>> } {
  const incomplete: string[] = []
  const counts: Partial<Record<RoomCategory, number>> = {}
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein!, BUILTIN_CATALOG, {})
    for (const level of planLevels(tpl)) {
      for (const room of level.rooms) {
        const cat = roomCategory(room)
        const reqs = REQUIREMENTS[cat]
        if (!reqs) continue
        counts[cat] = (counts[cat] ?? 0) + 1
        const inRoom = items.filter(
          (it) =>
            (it.levelId ?? GROUND_LEVEL_ID) === level.id &&
            it.position[0] >= room.origin[0] &&
            it.position[0] <= room.origin[0] + room.width &&
            it.position[1] >= room.origin[1] &&
            it.position[1] <= room.origin[1] + room.depth,
        )
        const missing = reqs
          .filter((r) => !inRoom.some((it) => r.anyOf.includes(it.defId)))
          .map((r) => r.label)
        if (missing.length > 0) {
          incomplete.push(`${tpl.id}/${level.id}/${room.id}: missing ${missing.join(', ')}`)
        }
      }
    }
  }
  return { incomplete, counts }
}

describe('a room contains the fixture that makes it that room', () => {
  it('surveys the shipped corpus', () => {
    expect(movein).toBeDefined()
    // Guards the instrument: a survey that found nothing would make the
    // assertion below pass vacuously.
    const { counts } = survey()
    expect(counts.bedroom ?? 0).toBeGreaterThan(20)
    expect(counts.masterBedroom ?? 0).toBeGreaterThan(10)
    expect(counts.kitchen ?? 0).toBe(18)
  }, 180_000)

  it('matches the recorded incomplete rooms exactly', () => {
    expect(survey().incomplete.sort()).toEqual([...KNOWN_INCOMPLETE].sort())
  }, 180_000)

  it('leaves NO bedroom without a bed', () => {
    // Stated separately and as an inequality: a bedroom with no bed is the worst
    // of these, so it gets an assertion that cannot be satisfied by trading a
    // kitchen fault for a bedroom one.
    const bedless = survey().incomplete.filter((r) => r.includes('missing a bed'))
    // ZERO since v0.31.9.17. Both offenders turned out to be defects rather than
    // capacity limits: `h5-bed3`'s bed was being evicted into the living room by
    // `unsealRoutes` (v0.31.9.16), and `g3-gen`'s door was centred on the only
    // wall long enough to take a bed. Keep this at zero — a bedroom with no bed
    // is the least defensible output this app can produce.
    expect(bedless).toEqual([])
  }, 180_000)
})
