/**
 * Pure builder for the furniture-list CSV export (Sweet Home 3D parity — "export
 * furniture list to CSV"). Turns the existing FF&E schedule (`ffe/ffeSchedule.ts`)
 * into a spreadsheet-friendly CSV — one row per (room, item, variant) — without
 * recomputing any pricing or dimensions. Kept separate from the download glue so
 * the formatting + escaping is unit-testable.
 */
import type { FfeRow } from '../ffe/ffeSchedule'
import { csvSafeField } from '../utils/csv'

/** Sanitise a user-controlled TEXT field: RFC-4180 quoting + neutralise leading
 *  formula characters (CSV-injection defense). */
const esc = csvSafeField

/** Metres → whole millimetres (real product dimensions read as mm in schedules). */
function mm(metres: number): string {
  return String(Math.round(metres * 1000))
}

/**
 * Build a CSV (CRLF line endings, Excel-friendly) from an FF&E schedule plus a
 * grand-total footer row. Columns: Room, Item, Source, SKU, Width(mm), Depth(mm),
 * Height(mm), Qty, Unit price, Total. Prices are rounded to whole SGD (matching
 * the schedule + shopping-list CSV). An empty schedule yields just the header +
 * the (zero) total row.
 */
export function buildFurnitureCsv(rows: FfeRow[]): string {
  const header = [
    'Room',
    'Item',
    'Source',
    'SKU',
    'Width(mm)',
    'Depth(mm)',
    'Height(mm)',
    'Qty',
    'Unit price',
    'Total',
  ]
  let grand = 0
  const body = rows.map((r) => {
    grand += r.total
    return [
      esc(r.room),
      esc(r.name),
      esc(r.source),
      esc(r.sku),
      mm(r.w),
      mm(r.d),
      mm(r.h),
      String(r.qty),
      String(Math.round(r.unit)),
      String(Math.round(r.total)),
    ]
  })
  body.push(['', 'Total', '', '', '', '', '', '', '', String(Math.round(grand))])
  return [header, ...body].map((cells) => cells.join(',')).join('\r\n')
}
