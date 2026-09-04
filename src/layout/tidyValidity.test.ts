import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import type { FloorPlan } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { furnishPlanItems } from '../furniture/furnishPlan'
import { LAYOUT_PRESETS } from '../furniture/layoutPresets'
import type { FurnitureItem } from '../furniture/types'
import { defaultParamProps } from '../furniture/types'
import { arrangeAllRoomsForPlan } from './autoArrange'

/**
 * TIDY-VALIDITY invariant (v0.31.9.26) — tidying a valid layout never makes an
 * item invalid. Asserted at **ZERO**, no allowlist.
 *
 * This is the invariant RESERVE-RETRY exists to protect, and the reason it is a
 * test of its own is the shape of the failure it is meant to catch. `world`
 * deliberately excludes items still PENDING placement, "so a messy starting
 * layout can't block the tidy target" — with the consequence that a piece can be
 * placed on top of one that has not had its turn yet, and when that buried piece
 * finds nowhere else to go it keeps its original transform and the room comes
 * out invalid.
 *
 * Measured on the default flat (v0.31.9.25): `default-sy-rack` was VALID at
 * (5.30, 7.20), **never moved**, and came out invalid because
 * `default-sy-washer` was placed over it. No amount of extra searching in
 * `settle` can fix that — by the time it runs, the spot is gone.
 *
 * **Honesty note: this passes today with `reserveRetry` OFF too.** The corpus
 * does not currently reproduce a burial — the case that does needs
 * v0.31.9.24's wall-ENDS sweep candidate, which is not shipped yet. This file is
 * here so that when a placement lever DOES rebalance the corpus, the breakage
 * arrives as "tidying made something invalid" rather than as a single opaque
 * `invalid at [x,y]` inside a test about door swings, which is how v0.31.9.24
 * surfaced and cost a release to diagnose.
 *
 * Judged in list order against everything ahead, matching
 * `autoArrange.test.ts`'s own sweep and `furnishValidity.test.ts`, so all three
 * agree on what "invalid" means.
 */
const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!

function hydrate(): FurnitureItem[] {
  return defaultLayout().map((e) => {
    const def = BUILTIN_CATALOG[e.defId]
    return def?.kind === 'parametric'
      ? { ...e, props: { ...defaultParamProps(def), ...e.props } }
      : e
  })
}

function invalidIn(plan: FloorPlan, items: FurnitureItem[], label: string): string[] {
  const bad: string[] = []
  for (const level of planLevels(plan)) {
    const walls = planCollisionWalls(levelAsPlan(plan, level), {})
    if (walls.length === 0) continue
    const ahead: FurnitureItem[] = []
    for (const it of items) {
      if ((it.levelId ?? GROUND_LEVEL_ID) !== level.id) continue
      const def = BUILTIN_CATALOG[it.defId]
      if (!def) continue
      if (def.mounted || def.noClip) {
        ahead.push(it)
        continue
      }
      if (canPlace(it, def, { others: ahead, defs: BUILTIN_CATALOG, doors: {}, walls })) {
        ahead.push(it)
      } else {
        bad.push(`${label} ${it.defId} @${it.position.map((n) => n.toFixed(2)).join(',')}`)
      }
    }
  }
  return bad
}

describe('tidy validity — tidying never buries a piece', () => {
  it('leaves every template valid after a tidy of its furnished layout', () => {
    const bad: string[] = []
    for (const tpl of PLAN_TEMPLATES) {
      const furnished = furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
      // Sanity: the input must be valid, or this asserts nothing about tidying.
      expect(invalidIn(tpl, furnished, `${tpl.id} BEFORE`)).toEqual([])
      const tidied = arrangeAllRoomsForPlan(tpl, furnished, BUILTIN_CATALOG, {})
      bad.push(...invalidIn(tpl, tidied, `${tpl.id} AFTER`))
    }
    expect(bad.sort()).toEqual([])
  }, 300_000)

  it('leaves the default flat valid after a tidy', () => {
    // The case that actually failed in v0.31.9.24 — the default flat's service
    // yard, where a `washing-machine` was placed onto a `drying-rack` that was
    // already sitting somewhere legal.
    const plan = buildDefaultPlan()
    expect(invalidIn(plan, hydrate(), 'default BEFORE')).toEqual([])
    const tidied = arrangeAllRoomsForPlan(plan, hydrate(), BUILTIN_CATALOG, {})
    expect(invalidIn(plan, tidied, 'default AFTER')).toEqual([])
    // The no-delete contract the arranger owes the interactive tidy.
    expect(tidied.length).toBe(hydrate().length)
  }, 60_000)
})
