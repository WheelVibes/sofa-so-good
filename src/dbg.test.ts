import { describe, it } from 'vitest'
import { PLAN_TEMPLATES } from './floorplan/templates'
import { BUILTIN_CATALOG } from './furniture/builtinCatalog'
import { furnishPlanItems } from './furniture/furnishPlan'
import { LAYOUT_PRESETS } from './furniture/layoutPresets'

describe('dbg', () => {
  it('fix trace', () => {
    const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!
    const tpl = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-maisonette')!
    furnishPlanItems(tpl, movein, BUILTIN_CATALOG, {})
  }, 60000)
})
