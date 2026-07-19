import { describe, expect, it } from 'vitest'
import { buildDesignScore } from '../analysis/designScore'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { blockedDoorItems } from '../layout/clearance'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { defaultLayout } from './defaultLayout'
import { buildPresetItems, LAYOUT_PRESETS } from './layoutPresets'
import { defaultParamProps } from './types'

/**
 * UXW-P2-3 regression guard. The shipped move-in default flat and every Smart
 * Start preset furnish the BUILT-IN plan from FIXED authored layout tables
 * (`defaultLayout()` / `buildPresetItems`), NOT `furnishPlanItems` — so they
 * bypass the arranger's door keep-outs + `dropDoorBlockers` safety net that the
 * RM3 property test (`placementSoundness.test.ts`) exercises for templates. A
 * blocking basin therefore escaped every existing guard. These tests pin the
 * fixed tables directly: no floor item may sit in a door's path, and the app's
 * own Design score must not harshly fail its own starter layout.
 */

/** Mirror the store's `hydrateLayout` (resetSlice) — merge schema defaults so
 *  parametric footprints resolve to their real size. */
function hydrateDefault() {
  return defaultLayout().map((entry) => {
    const def = BUILTIN_CATALOG[entry.defId]
    if (def?.kind === 'parametric') {
      return { ...entry, props: { ...defaultParamProps(def), ...entry.props } }
    }
    return entry
  })
}

describe('UXW-P2-3 default flat clearance + score', () => {
  const plan = buildDefaultPlan()

  it('the move-in default flat blocks NO door swing', () => {
    const blocked = blockedDoorItems(hydrateDefault(), BUILTIN_CATALOG, plan)
    expect(blocked, blocked.join(', ')).toEqual([])
  })

  it('every Smart Start preset blocks NO door swing on the default flat', () => {
    for (const preset of LAYOUT_PRESETS) {
      const items = buildPresetItems(preset)
      const blocked = blockedDoorItems(items, BUILTIN_CATALOG, plan)
      expect(blocked, `${preset.id}: ${blocked.join(', ')}`).toEqual([])
    }
  })

  it('every THEME preset passes the app’s own checks on the default flat (P2-2)', () => {
    // The e2e journey applies a gallery THEME to a blank BTO; the finished
    // design must not fail the app's own Design score. Assert per theme: no
    // blocked door, circulation materially above zero, and an overall score
    // that isn't in the failing band. (Layout-group presets — wfh-studio etc.
    // — are re-modelled arrangements judged separately.)
    const themes = LAYOUT_PRESETS.filter((p) => p.group === 'theme')
    expect(themes.length).toBeGreaterThan(0)
    for (const preset of themes) {
      const items = buildPresetItems(preset)
      const blocked = blockedDoorItems(items, BUILTIN_CATALOG, plan)
      expect(blocked, `${preset.id} blocked: ${blocked.join(', ')}`).toEqual([])
      const score = buildDesignScore(items, BUILTIN_CATALOG, plan)
      const circulation = score.categories.find((c) => c.id === 'circulation')!
      expect(circulation.score, `${preset.id} circulation`).toBeGreaterThanOrEqual(40)
      expect(score.overall, `${preset.id} overall`).toBeGreaterThanOrEqual(65)
    }
  })

  it('the default flat is not harshly failed by its own Design score', () => {
    const score = buildDesignScore(hydrateDefault(), BUILTIN_CATALOG, plan)
    const clearance = score.categories.find((c) => c.id === 'clearance')!
    const circulation = score.categories.find((c) => c.id === 'circulation')!
    // No blocking clearance finding → full clearance marks.
    expect(clearance.score).toBe(100)
    // Circulation is no longer hard-zeroed by advisory snug adjacencies (it was
    // 0/100 before UXW-P2-3). A livable dense flat with no impassable pinch
    // must land materially above zero.
    expect(circulation.score).toBeGreaterThanOrEqual(40)
    // Overall lifts out of the failing band it was stuck in (was 59/F).
    expect(score.overall).toBeGreaterThanOrEqual(70)
  })
})
