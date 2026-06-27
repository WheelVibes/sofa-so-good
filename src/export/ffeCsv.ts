/**
 * Pure builder for the FF&E schedule CSV export (PARITY-FFE-CSV — Fohlio / Houzz
 * / Programa "FF&E schedule" parity). The machine-readable companion to the FF&E
 * HTML table the report renders: one row per (room, item, variant) with source,
 * SKU, real size, quantity and pricing, plus a grand-total footer.
 *
 * Mirrors `export/roomScheduleCsv.ts` + `ui/furnitureCsv.ts`: pure, render-
 * agnostic, unit-testable, RFC-4180 quoted with OWASP CSV-injection defense
 * (`utils/csv`). It consumes the existing `FfeRow[]` from `buildFfeSchedule`
 * (no recomputed pricing or dimensions) and is unit-aware (the Size column reads
 * in cm / inches per the chosen system).
 *
 * Self-contained: imports only sibling pure modules + types (no store / React).
 */

import type { FfeRow } from '../ffe/ffeSchedule'
import { csvSafeField } from '../utils/csv'
import { formatDimsShort, type UnitSystem } from '../utils/measurement'

/** Options for the FF&E CSV. `prices: false` blanks the price columns (and the
 *  grand-total) — used when the budget / pricing feature is off, so the schedule
 *  still ships size + quantity. */
export interface FfeCsvOptions {
  /** Emit unit / line-total prices (whole SGD). Default true. */
  prices?: boolean
}

/**
 * Build a CSV (CRLF line endings, Excel-friendly) from an FF&E schedule plus a
 * grand-total footer row. Columns: Room, Item, Source, SKU, Size (W×D×H), Qty,
 * Unit price, Line total. The Size column is formatted in the chosen unit system
 * ("60 × 45 × 75 cm" / "24″ × 18″ × 30″"); prices are whole SGD (matching the
 * schedule + furniture CSV). With `prices: false` the two price columns + the
 * footer total are left blank. An empty schedule yields just the header + the
 * (zero) total row — always valid CSV.
 */
export function buildFfeCsv(
  rows: FfeRow[],
  units: UnitSystem = 'metric',
  opts: FfeCsvOptions = {},
): string {
  const withPrices = opts.prices !== false
  const header = [
    'Room',
    'Item',
    'Source',
    'SKU',
    'Size (W×D×H)',
    'Qty',
    'Unit price',
    'Line total',
  ]
  let grand = 0
  const body = rows.map((r) => {
    grand += r.total
    return [
      csvSafeField(r.room),
      csvSafeField(r.name),
      csvSafeField(r.source),
      csvSafeField(r.sku),
      csvSafeField(formatDimsShort([r.w, r.d, r.h], units)),
      String(r.qty),
      withPrices ? String(Math.round(r.unit)) : '',
      withPrices ? String(Math.round(r.total)) : '',
    ]
  })
  // Grand-total footer: item-row count in the Room cell, summed total in Line total.
  body.push([
    csvSafeField(`Total (${rows.length} ${rows.length === 1 ? 'item' : 'items'})`),
    '',
    '',
    '',
    '',
    '',
    '',
    withPrices ? String(Math.round(grand)) : '',
  ])
  return [header, ...body].map((cells) => cells.join(',')).join('\r\n')
}
