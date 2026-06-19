/**
 * Minimal OOXML (.xlsx) export of a bill of quantities (PARITY-QUOTEXLSX) — the
 * Excel deliverable contractors/clients expect alongside the CSV/HTML quote.
 * Hand-built (no SheetJS dependency) as a small ZIP of the five parts a valid
 * single-sheet workbook needs, using `fflate` (already a dep). Text cells use
 * inline strings so there's no shared-strings part; numbers are numeric cells.
 *
 * Pure (returns the file bytes) so it's unit-testable by unzipping the result.
 */
import { strToU8, zipSync } from 'fflate'
import type { Boq } from './boq'
import type { QuoteTemplate } from './quoteTemplate'

const xmlEsc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c,
  )

type Cell = string | number

/** 0-based column index → spreadsheet letter (0→A, 25→Z, 26→AA, …). */
export function columnLetter(index: number): string {
  let s = ''
  let n = index
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function cellXml(ref: string, v: Cell): string {
  if (typeof v === 'number') {
    return `<c r="${ref}"><v>${Number.isFinite(v) ? v : 0}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`
}

function rowXml(rowNumber: number, cells: Cell[]): string {
  const c = cells.map((v, i) => cellXml(`${columnLetter(i)}${rowNumber}`, v)).join('')
  return `<row r="${rowNumber}">${c}</row>`
}

/**
 * The BOQ as a grid of rows (header + lines + per-section subtotals + grand
 * total) — mirrors `boqToCsv` so the two exports stay in lock-step. Exported
 * for the unit test.
 *
 * When a `template` is provided: company/contact/headerNote rows are prepended;
 * footerNote is appended; currency label is used in column headings.
 * Omitting the template (or passing the default) reproduces the original output.
 */
export function boqRows(boq: Boq, template?: QuoteTemplate): Cell[][] {
  const currencyLabel = template?.currencyLabel || 'SGD'
  const rows: Cell[][] = []

  // Optional header rows.
  if (template?.companyName) rows.push([template.companyName])
  if (template?.contactLine) rows.push([template.contactLine])
  if (template?.headerNote) rows.push([template.headerNote])
  if (rows.length > 0) rows.push(['']) // blank separator

  rows.push([
    'Section',
    'Description',
    'Qty',
    'Unit',
    'Length (ft)',
    `Rate (${currencyLabel})`,
    `Amount (${currencyLabel})`,
  ])
  for (const section of boq.sections) {
    for (const line of section.lines) {
      rows.push([
        section.title,
        line.description,
        line.qty,
        line.unit,
        line.lengthFt ?? '',
        line.rate,
        line.amount,
      ])
    }
    rows.push([section.title, 'Subtotal', '', '', '', '', section.subtotal])
  }
  rows.push(['', 'Grand Total', '', '', '', '', boq.total])

  // Optional footer note.
  if (template?.footerNote) {
    rows.push([''])
    rows.push([template.footerNote])
  }

  return rows
}

/** Build the `.xlsx` file bytes for a bill of quantities. */
export function boqToXlsx(boq: Boq, template?: QuoteTemplate): Uint8Array {
  const sheetData = boqRows(boq, template)
    .map((r, i) => rowXml(i + 1, r))
    .join('')
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Quotation" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  })
}
