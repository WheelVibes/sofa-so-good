/**
 * Pure builder for the combined cost-breakdown CSV export
 * (PARITY-COST-BREAKDOWN-CSV). One machine-readable file that reconciles the
 * cost surfaces the report shows separately:
 *
 *   1. FURNITURE — placed items grouped by category (qty + estimated subtotal),
 *      priced with the live budget model (`furniture/furniturePrices.itemPrice`,
 *      respecting each instance's IKEA variant — same as `reportData.lineEach`).
 *   2. RENOVATION (finishes) — flooring + painting/wall lines from the indicative
 *      SG supply-and-install rate table (`analysis/renovationCost.estimateRenovation`),
 *      fed by the per-finish area schedules (`reportData.floorAreaByFinish` /
 *      `wallAreaByFinish`) — the same numbers the BOQ / report use.
 *   3. GRAND TOTAL — the sum of the section subtotals.
 *
 * Pure + render-agnostic + unit-testable, like `ui/furnitureCsv.ts`: it reuses
 * the existing price + estimate functions (no reinvented pricing), imports only
 * pure modules + types (no store / React), and emits RFC-4180 CSV via `utils/csv`
 * (text → `csvSafeField` OWASP-injection-guarded, money/area → `csvNumberField`).
 * The caller prepends a UTF-8 BOM at download time.
 *
 * Money columns are raw SGD numbers (so a spreadsheet can re-sum them); the
 * currency (SGD) is implied by the section copy. `units` is accepted for
 * signature parity with the sibling CSV builders, though every figure here is a
 * money total (unit-independent) bar the m² area column.
 */

import { estimateRenovation, type PriceRules } from '../analysis/renovationCost'
import type { FloorPlan } from '../floorplan/types'
import { itemPrice } from '../furniture/furniturePrices'
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type FurnitureDef,
  type FurnitureItem,
} from '../furniture/types'
import { type FinishesByRoom, floorAreaByFinish, wallAreaByFinish } from '../ui/reportData'
import { csvNumberField, csvSafeField } from '../utils/csv'
import type { UnitSystem } from '../utils/measurement'

/** Friendly category labels (mirrors `BudgetPanel`'s `CATEGORY_LABEL`; kept
 *  local so this builder stays pure + self-contained). */
const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

/** One aggregated furniture-category line. */
export interface CategoryCost {
  category: FurnitureCategory
  label: string
  /** Number of placed items in this category. */
  qty: number
  /** Estimated subtotal (SGD). */
  subtotal: number
}

/** One priced finishes/renovation line (floor or wall finish). */
export interface FinishCost {
  /** Resolved finish display name. */
  name: string
  /** Surface kind. */
  surface: 'Floor' | 'Wall'
  /** Surface area (m²). */
  areaM2: number
  /** Supply+install rate applied (SGD per m²). */
  rate: number
  /** Estimated line cost (SGD). */
  cost: number
}

export interface CostBreakdown {
  furniture: CategoryCost[]
  /** Sum of every furniture category subtotal (SGD). */
  furnitureSubtotal: number
  finishes: FinishCost[]
  /** Sum of every renovation/finishes line (SGD). */
  renovationSubtotal: number
  /** furnitureSubtotal + renovationSubtotal (SGD). */
  grandTotal: number
}

/** Estimated unit price of a placed item — respects the active IKEA variant.
 *  Mirrors `reportData.lineEach` (kept local to avoid the report module's heavier
 *  surface). */
function lineEach(item: FurnitureItem, def: FurnitureDef): number {
  const variant = typeof item.props['variant'] === 'string' ? item.props['variant'] : undefined
  return itemPrice(def, def.category, variant)
}

/**
 * Aggregate the live design into the structured cost breakdown. Furniture is
 * grouped by category (qty + summed estimated price); finishes are priced via
 * the renovation rate table over the per-finish area schedules. Categories with
 * no items are omitted; finishes lines arrive cost-sorted from `estimateRenovation`.
 * Totals reconcile by construction: `grandTotal === furnitureSubtotal +
 * renovationSubtotal`. Tolerates an empty plan / no items (all zero).
 */
export function buildCostBreakdown(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  finishes: FinishesByRoom | undefined,
  nameOf: (id: string) => string,
  priceRules?: PriceRules,
): CostBreakdown {
  // --- Furniture by category ---
  const byCat = new Map<FurnitureCategory, CategoryCost>()
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const cat = def.category
    const each = lineEach(it, def)
    const row = byCat.get(cat) ?? { category: cat, label: CATEGORY_LABEL[cat], qty: 0, subtotal: 0 }
    row.qty += 1
    row.subtotal += each
    byCat.set(cat, row)
  }
  // Emit in the canonical category order so the file is stable run-to-run.
  const furniture = FURNITURE_CATEGORIES.filter((c) => byCat.has(c)).map((c) => byCat.get(c)!)
  const furnitureSubtotal = furniture.reduce((s, r) => s + r.subtotal, 0)

  // --- Renovation (finishes) via the existing rate model ---
  const floors = floorAreaByFinish(plan, finishes?.floor)
  const walls = wallAreaByFinish(plan, finishes?.walls, plan.ceilingHeight)
  const reno = estimateRenovation(floors, walls, priceRules)
  const finishLines: FinishCost[] = [
    ...reno.floors.map(
      (l): FinishCost => ({
        name: nameOf(l.id),
        surface: 'Floor',
        areaM2: l.area,
        rate: l.rate,
        cost: l.cost,
      }),
    ),
    ...reno.walls.map(
      (l): FinishCost => ({
        name: nameOf(l.id),
        surface: 'Wall',
        areaM2: l.area,
        rate: l.rate,
        cost: l.cost,
      }),
    ),
  ]

  return {
    furniture,
    furnitureSubtotal,
    finishes: finishLines,
    renovationSubtotal: reno.subtotal,
    grandTotal: furnitureSubtotal + reno.subtotal,
  }
}

/** Round an area to 2 dp for the CSV (the raw m² carries float noise). */
function area2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Build a sectioned cost-breakdown CSV (CRLF line endings, Excel-friendly). The
 * single file carries three blocks separated by a blank row:
 *
 *   Section,Item,Qty,Area (m²),Rate (SGD/m²),Subtotal (SGD)   ← header
 *   Furniture,Seating,3,,,1650
 *   …
 *   Furniture subtotal,,,,,1650
 *   (blank)
 *   Renovation,Oak (Floor),,12,120,1440
 *   …
 *   Renovation subtotal,,,,,1440
 *   (blank)
 *   GRAND TOTAL,,,,,3090
 *
 * Money columns are raw numbers (re-summable in a sheet). Text fields are
 * `csvSafeField`-guarded against CSV injection. An empty plan / no items yields
 * the header, empty sections with zero subtotals, and a zero grand-total row, so
 * `grandTotal === furnitureSubtotal + renovationSubtotal` always holds.
 * `units` is reserved for parity with the sibling CSV exports.
 */
export function buildCostBreakdownCsv(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  finishes: FinishesByRoom | undefined,
  nameOf: (id: string) => string,
  _units: UnitSystem = 'metric',
  priceRules?: PriceRules,
): string {
  const b = buildCostBreakdown(plan, items, catalog, finishes, nameOf, priceRules)
  const header = ['Section', 'Item', 'Qty', 'Area (m²)', 'Rate (SGD/m²)', 'Subtotal (SGD)']
  const rows: string[][] = [header]

  // Furniture block.
  for (const c of b.furniture) {
    rows.push([
      csvSafeField('Furniture'),
      csvSafeField(c.label),
      csvNumberField(c.qty),
      '',
      '',
      csvNumberField(c.subtotal),
    ])
  }
  rows.push([
    csvSafeField('Furniture subtotal'),
    '',
    '',
    '',
    '',
    csvNumberField(b.furnitureSubtotal),
  ])

  // Blank separator + renovation/finishes block.
  rows.push(['', '', '', '', '', ''])
  for (const f of b.finishes) {
    rows.push([
      csvSafeField('Renovation'),
      csvSafeField(`${f.name} (${f.surface})`),
      '',
      csvNumberField(area2(f.areaM2)),
      csvNumberField(f.rate),
      csvNumberField(f.cost),
    ])
  }
  rows.push([
    csvSafeField('Renovation subtotal'),
    '',
    '',
    '',
    '',
    csvNumberField(b.renovationSubtotal),
  ])

  // Blank separator + grand total.
  rows.push(['', '', '', '', '', ''])
  rows.push([csvSafeField('GRAND TOTAL'), '', '', '', '', csvNumberField(b.grandTotal)])

  return rows.map((cells) => cells.join(',')).join('\r\n')
}
