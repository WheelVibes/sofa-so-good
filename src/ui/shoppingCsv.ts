/**
 * Pure builder for the shopping-list CSV export (procurement / spreadsheet).
 * Kept separate from `BudgetPanel` so the formatting + escaping is unit-testable.
 */
import { csvSafeField } from '../utils/csv'

export interface CsvLine {
  category: string
  item: string
  qty: number
  /** Unit price (SGD). */
  unit: number
  /** Line total (SGD) = unit × qty. */
  total: number
}

/** Sanitise a user-controlled TEXT field: RFC-4180 quoting + neutralise leading
 *  formula characters (CSV-injection defense). */
const esc = csvSafeField

/**
 * Build a CSV (CRLF line endings, Excel-friendly) from shopping-list rows plus a
 * grand-total footer. Prices are rounded to whole SGD.
 */
export function buildShoppingCsv(lines: CsvLine[], grandTotal: number): string {
  const header = ['Category', 'Item', 'Quantity', 'Unit price (SGD)', 'Line total (SGD)']
  const body = lines.map((l) => [
    esc(l.category),
    esc(l.item),
    String(l.qty),
    String(Math.round(l.unit)),
    String(Math.round(l.total)),
  ])
  body.push(['', '', '', 'Total', String(Math.round(grandTotal))])
  return [header, ...body].map((r) => r.join(',')).join('\r\n')
}
