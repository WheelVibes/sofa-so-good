/**
 * Store → allocator glue + CSV export for the whole-renovation budget allocator
 * (BSJ-1). Kept out of the panel component so the assembly + CSV are pure and
 * unit-testable, and so the CSV export can reuse the exact same allocation the
 * panel shows. Mirrors `openBoq.assembleBoqInput` for finish-map resolution.
 */

import { buildRenovationAllocation, type RenoAllocation } from '../analysis/renovationAllocator'
import { buildVariationRegister, type VariationRegister } from '../analysis/variationRegister'
import { isFeatureEnabled } from '../features/featureFlags'
import { allPlanRooms } from '../floorplan/levels'
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
  for (const r of allPlanRooms(plan)) if (r.floor) m[r.id] = r.floor
  return m
}

/** Wall-finish map for the active plan (same rule as the floor map). */
function wallMap(state: RootState, plan: FloorPlan): Record<string, string> {
  if (isDefaultPlan(plan)) return state.finishes.walls as Record<string, string>
  const m: Record<string, string> = {}
  for (const r of allPlanRooms(plan)) if (r.wall) m[r.id] = r.wall
  return m
}

/**
 * The variation register: the tendered snapshot's allocation against the
 * current one. `null` until the user marks a design as tendered — an unmarked
 * design has nothing to vary FROM, and showing an empty table would imply
 * otherwise.
 *
 * Both allocations are built with the SAME rate card (`state.priceRules`), so a
 * delta reflects a design change rather than a re-pricing. The register's own
 * note says a line can still move because the rate card changed, since the
 * snapshot does not capture rates.
 */
export function assembleVariationRegister(state: RootState): VariationRegister | null {
  const snap = state.tenderedSnapshot
  if (!snap) return null
  const catalog = buildMergedCatalog(state)
  const common = {
    catalog,
    rules: state.priceRules,
    orientationDeg: state.orientationDeg,
    waterproofing: isFeatureEnabled('waterproofing'),
    airconTrunking: isFeatureEnabled('airconTrunking'),
  }
  const tendered = buildRenovationAllocation({
    ...common,
    plan: snap.plan,
    items: snap.items,
    floorFinishes: snap.finishes.floor,
    wallFinishes: snap.finishes.walls,
    baselinePlan: state.baselinePlan,
  })
  const current = assembleRenoAllocation(state)
  return buildVariationRegister(tendered, current)
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
export function buildRenovationBudgetCsv(
  a: RenoAllocation,
  /** Appended as a second block when a design has been marked as tendered. The
   *  budget CSV is what a contractor actually receives, so the variation
   *  belongs on the same sheet as the price it varies — not in a separate
   *  export nobody opens next to it. */
  variation?: VariationRegister | null,
  /** Snapshot metadata for the register's header, so the sheet states WHICH
   *  issue was priced rather than just that something changed. */
  tendered?: { at: string; revision: string } | null,
): string {
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
  if (variation && !variation.unchanged) {
    rows.push([])
    rows.push([
      csvSafeField(
        `VARIATION REGISTER — against Rev ${tendered?.revision ?? '?'}${
          tendered?.at ? ` marked as tendered ${tendered.at.slice(0, 10)}` : ''
        }`,
      ),
    ])
    rows.push([
      'Trade',
      'Change',
      'Qty tendered',
      'Qty now',
      'Tendered (SGD)',
      'Now (SGD)',
      'Delta (SGD)',
    ])
    for (const l of variation.lines) {
      rows.push([
        csvSafeField(l.label),
        csvSafeField(l.kind),
        csvNumberField(l.quantityBefore),
        csvNumberField(l.quantityAfter),
        csvNumberField(l.subtotalBefore),
        csvNumberField(l.subtotalAfter),
        csvNumberField(l.deltaSgd),
      ])
    }
    rows.push(['Additions', '', '', '', '', '', csvNumberField(variation.addedSgd)])
    rows.push(['Omissions', '', '', '', '', '', csvNumberField(variation.omittedSgd)])
    rows.push(['NET VARIATION', '', '', '', '', '', csvNumberField(variation.netSgd)])
    rows.push([csvSafeField(variation.note)])
  }
  return rows.map((cells) => cells.join(',')).join('\r\n')
}
