/**
 * Store → allocator glue + CSV export for the whole-renovation budget allocator
 * (BSJ-1). Kept out of the panel component so the assembly + CSV are pure and
 * unit-testable, and so the CSV export can reuse the exact same allocation the
 * panel shows. Mirrors `openBoq.assembleBoqInput` for finish-map resolution.
 */

import { buildRenovationAllocation, type RenoAllocation } from '../analysis/renovationAllocator'
import { isFeatureEnabled } from '../features/featureFlags'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import type { RootState } from '../state/store'
import { csvNumberField, csvSafeField } from '../utils/csv'

/** Floor-finish map for the active plan (store finishes for the default flat,
 *  else each custom room's own `floor`). Mirrors `openBoq.floorMap`. */
function floorMap(state: RootState, plan: FloorPlan): Record<string, string> {
  if (isDefaultPlan(plan)) return state.finishes.floor as Record<string, string>
  const m: Record<string, string> = {}
  for (const r of plan.rooms) if (r.floor) m[r.id] = r.floor
  return m
}

/** Wall-finish map for the active plan (same rule as the floor map). */
function wallMap(state: RootState, plan: FloorPlan): Record<string, string> {
  if (isDefaultPlan(plan)) return state.finishes.walls as Record<string, string>
  const m: Record<string, string> = {}
  for (const r of plan.rooms) if (r.wall) m[r.id] = r.wall
  return m
}

/** Assemble the whole-renovation allocation from the live store state. */
export function assembleRenoAllocation(state: RootState): RenoAllocation {
  const plan = state.floorPlan
  return buildRenovationAllocation({
    plan,
    items: state.items,
    catalog: buildMergedCatalog(state),
    floorFinishes: floorMap(state, plan),
    wallFinishes: wallMap(state, plan),
    rules: state.priceRules,
    baselinePlan: state.baselinePlan,
    orientationDeg: state.orientationDeg,
    budgetTarget: state.budgetTarget ?? undefined,
    waterproofing: isFeatureEnabled('waterproofing'),
    airconTrunking: isFeatureEnabled('airconTrunking'),
  })
}

/**
 * Sectioned CSV of the trade allocation (CRLF, Excel-friendly). Money columns
 * are raw numbers (re-summable); text fields are `csvSafeField`-guarded. Mirrors
 * the shape of `costBreakdownCsv`.
 */
export function buildRenovationBudgetCsv(a: RenoAllocation): string {
  const header = ['Trade', 'Stage', 'Quantity', 'Unit', 'Rate (SGD)', 'Subtotal (SGD)']
  const rows: string[][] = [header]
  for (const l of a.lines) {
    rows.push([
      csvSafeField(l.label),
      csvSafeField(l.stage),
      csvNumberField(l.quantity),
      csvSafeField(l.unit),
      csvNumberField(l.rate),
      csvNumberField(l.subtotal),
    ])
  }
  rows.push(['Subtotal', '', '', '', '', csvNumberField(a.subtotal)])
  rows.push([`Contingency (${a.contingencyPct}%)`, '', '', '', '', csvNumberField(a.contingency)])
  rows.push(['GRAND TOTAL', '', '', '', '', csvNumberField(a.total)])
  if (a.target != null) {
    rows.push(['Budget target', '', '', '', '', csvNumberField(a.target)])
    rows.push([
      a.overUnder != null && a.overUnder > 0 ? 'Over budget' : 'Under budget',
      '',
      '',
      '',
      '',
      csvNumberField(Math.abs(a.overUnder ?? 0)),
    ])
  }
  return rows.map((cells) => cells.join(',')).join('\r\n')
}
