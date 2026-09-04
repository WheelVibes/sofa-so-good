import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID, planLevels } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { pointInRoom } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'

/**
 * ROOM-LIGHTING invariant (v0.31.9.23) — every habitable room gets a light.
 *
 * This one is asserted at **ZERO**, not ratcheted at a known count, because
 * there is no defensible reason for a furnished room to have no light source at
 * all. It reads 0 of 156 as of v0.31.9.23.
 *
 * It was 3 before that release, all of them kitchens, and the cause was
 * `dropOverlaps` resolving every clash by DELETION. That is right for two floor
 * pieces competing for the same floor and wrong for a ceiling light, which has
 * the whole ceiling to choose from. `tpl-1bed/ob-kit` is the case that made it
 * visible: v0.31.9.22 finally gave that kitchen a stove, the `range-hood` moved
 * to hang over it as it must, the hood's box then covered the centre of the room
 * where the light sat, and the light was deleted — so the release that furnished
 * the kitchen un-lit it. `relocateCeilingMounts` nudges the light instead, and
 * the same pass also lit `tpl-condo-1bed/c1-kit` and `tpl-condo-studio/su-kit`,
 * which had been dark since long before.
 *
 * **Do NOT add an allowlist to silence a failure.** If a room cannot hold a
 * light, that is a template or kit defect, not an acceptable state.
 *
 * `balcony` and `other` are excluded: an outdoor balcony has no ceiling to mount
 * to, and `other` covers undeclared circulation slivers that carry no kit.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

const LIGHT_RE = /light|lamp|pendant|sconce/

function survey(): { dark: string[]; rooms: number } {
  const dark: string[] = []
  let rooms = 0
  for (const tpl of PLAN_TEMPLATES) {
    const items = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
    for (const level of planLevels(tpl)) {
      for (const r of level.rooms) {
        const cat = roomCategory(r)
        if (cat === 'balcony' || cat === 'other') continue
        rooms++
        const lit = items.some(
          (it) =>
            (it.levelId ?? GROUND_LEVEL_ID) === level.id &&
            LIGHT_RE.test(it.defId) &&
            pointInRoom(r, it.position[0], it.position[1]),
        )
        if (!lit) dark.push(`${tpl.id}/${level.id}/${r.id} (${cat})`)
      }
    }
  }
  return { dark: dark.sort(), rooms }
}

describe('room lighting — every habitable room has a light', () => {
  it('leaves no room dark', () => {
    expect(survey().dark).toEqual([])
  }, 120_000)

  it('examines the whole corpus', () => {
    /**
     * The corpus size is pinned alongside the finding for the reason
     * `roomOverhang.test.ts` does the same: an emptiness assertion passes just as
     * happily when the loop body never runs. That has now happened three times on
     * this thread, most recently from importing `GROUND_LEVEL_ID` out of
     * `floorplan/types`, where only the TYPE lives.
     */
    expect(survey().rooms).toBe(156)
  }, 120_000)
})
