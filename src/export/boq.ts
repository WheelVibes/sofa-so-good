/**
 * Quote-ready Bill of Quantities (BOQ) export — feature F33.
 *
 * Singapore interior designers hand clients a BOQ-style quote: line items grouped
 * into sections (FF&E, Flooring, Wall finishes, Carpentry), each with a subtotal,
 * plus a grand total. This module is PURE and self-contained: it accepts already
 * computed numbers (areas, rates, quantities) — it does NOT recompute finishes —
 * and produces a structured `Boq` plus CSV and (escaped) HTML renderings.
 *
 * Money is in SGD. Carpentry is priced per linear metre (the SG carpentry unit);
 * a linear-feet column is derived for the client's convenience (1 m = 3.28084 ft).
 */

import type { FloorPlan } from '../floorplan/types'

/** Metres → feet conversion (carpentry quotes often list both). */
export const M_TO_FT = 3.28084

/** A single FF&E (furniture / fixtures / equipment) entry. */
export interface BoqFurniture {
  name: string
  category?: string
  qty: number
  unitPrice: number
}

/** A finish line keyed by its named finish, priced per square metre. */
export interface BoqFinish {
  name: string
  areaSqm: number
  ratePerSqm: number
}

/** A carpentry line priced per linear metre. */
export interface BoqCarpentry {
  name: string
  lengthM: number
  ratePerM: number
}

/** A room summary (optional context; not itself billed). */
export interface BoqRoom {
  id: string
  name: string
  floorArea: number
  floorFinishName?: string
}

/** Input to {@link buildBoq}. All monetary inputs are pre-computed by the caller. */
export interface BoqInput {
  plan: FloorPlan
  rooms?: BoqRoom[]
  furniture?: BoqFurniture[]
  finishes?: {
    floorByFinish?: BoqFinish[]
    wallByFinish?: BoqFinish[]
  }
  carpentry?: BoqCarpentry[]
}

/** One priced line in a section. */
export interface BoqLine {
  description: string
  qty: number
  unit: string
  rate: number
  amount: number
  /** Carpentry only: the length expressed in linear feet (qty × 3.28084). */
  lengthFt?: number
}

/** A titled group of lines with its own subtotal. */
export interface BoqSection {
  title: string
  lines: BoqLine[]
  subtotal: number
}

/** A complete bill of quantities. */
export interface Boq {
  /** Plan name, for the quote header. */
  planName: string
  sections: BoqSection[]
  total: number
}

/** Round to cents (2 dp) — money should never carry float dust. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Round a derived length to 2 dp. */
function roundLen(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Format a number as SGD currency, e.g. `S$1,234.50`. */
export function sgd(n: number): string {
  const safe = Number.isFinite(n) ? n : 0
  const neg = safe < 0
  const cents = Math.round(Math.abs(safe) * 100)
  const dollars = Math.floor(cents / 100)
  const frac = (cents % 100).toString().padStart(2, '0')
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}S$${grouped}.${frac}`
}

function ffeSection(items: BoqFurniture[]): BoqSection | null {
  const lines: BoqLine[] = []
  for (const it of items) {
    const qty = Number.isFinite(it.qty) ? it.qty : 0
    const rate = round2(Number.isFinite(it.unitPrice) ? it.unitPrice : 0)
    const description = it.category ? `${it.name} (${it.category})` : it.name
    lines.push({ description, qty, unit: 'no.', rate, amount: round2(qty * rate) })
  }
  if (lines.length === 0) return null
  return { title: 'FF&E (Furniture, Fixtures & Equipment)', lines, subtotal: subtotalOf(lines) }
}

function finishSection(title: string, items: BoqFinish[]): BoqSection | null {
  const lines: BoqLine[] = []
  for (const it of items) {
    const qty = roundLen(Number.isFinite(it.areaSqm) ? it.areaSqm : 0)
    const rate = round2(Number.isFinite(it.ratePerSqm) ? it.ratePerSqm : 0)
    lines.push({ description: it.name, qty, unit: 'm²', rate, amount: round2(qty * rate) })
  }
  if (lines.length === 0) return null
  return { title, lines, subtotal: subtotalOf(lines) }
}

function carpentrySection(items: BoqCarpentry[]): BoqSection | null {
  const lines: BoqLine[] = []
  for (const it of items) {
    const qty = roundLen(Number.isFinite(it.lengthM) ? it.lengthM : 0)
    const rate = round2(Number.isFinite(it.ratePerM) ? it.ratePerM : 0)
    lines.push({
      description: it.name,
      qty,
      unit: 'lin.m',
      rate,
      amount: round2(qty * rate),
      lengthFt: roundLen(qty * M_TO_FT),
    })
  }
  if (lines.length === 0) return null
  return { title: 'Carpentry', lines, subtotal: subtotalOf(lines) }
}

function subtotalOf(lines: BoqLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.amount, 0))
}

/**
 * Build a structured bill of quantities. Missing/empty input groups are omitted
 * (no empty sections). Pure — no I/O, no mutation of the input.
 */
export function buildBoq(input: BoqInput): Boq {
  const sections: BoqSection[] = []

  const ffe = ffeSection(input.furniture ?? [])
  if (ffe) sections.push(ffe)

  const floor = finishSection('Flooring', input.finishes?.floorByFinish ?? [])
  if (floor) sections.push(floor)

  const wall = finishSection('Wall Finishes', input.finishes?.wallByFinish ?? [])
  if (wall) sections.push(wall)

  const carpentry = carpentrySection(input.carpentry ?? [])
  if (carpentry) sections.push(carpentry)

  const total = round2(sections.reduce((sum, s) => sum + s.subtotal, 0))
  return { planName: input.plan?.name ?? 'Untitled Plan', sections, total }
}

/** Quote a CSV field per RFC 4180: wrap in quotes + double internal quotes when needed. */
function csvField(value: string | number): string {
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Render the BOQ as a CSV string: a header row, then one row per line (with a
 * Section column), section subtotal rows, and a final grand-total row.
 */
export function boqToCsv(boq: Boq): string {
  const rows: string[] = []
  rows.push(
    ['Section', 'Description', 'Qty', 'Unit', 'Length (ft)', 'Rate (SGD)', 'Amount (SGD)']
      .map(csvField)
      .join(','),
  )
  for (const section of boq.sections) {
    for (const line of section.lines) {
      rows.push(
        [
          csvField(section.title),
          csvField(line.description),
          csvField(line.qty),
          csvField(line.unit),
          csvField(line.lengthFt ?? ''),
          csvField(line.rate),
          csvField(line.amount),
        ].join(','),
      )
    }
    rows.push(
      [
        csvField(section.title),
        csvField('Subtotal'),
        '',
        '',
        '',
        '',
        csvField(section.subtotal),
      ].join(','),
    )
  }
  rows.push(['', csvField('Grand Total'), '', '', '', '', csvField(boq.total)].join(','))
  return rows.join('\r\n')
}

/** Escape text for safe insertion into HTML element/attribute content. */
function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render the BOQ as a self-contained, fully-escaped HTML fragment: one table per
 * section with a subtotal row, then a grand-total row. No external CSS required.
 */
export function boqToHtml(boq: Boq): string {
  const parts: string[] = []
  parts.push('<section class="boq">')
  parts.push(`<h1>Bill of Quantities — ${escapeHtml(boq.planName)}</h1>`)
  if (boq.sections.length === 0) {
    parts.push('<p class="boq-empty">No items.</p>')
  }
  for (const section of boq.sections) {
    parts.push(`<table class="boq-section"><caption>${escapeHtml(section.title)}</caption>`)
    parts.push(
      '<thead><tr><th>Description</th><th>Qty</th><th>Unit</th>' +
        '<th>Length (ft)</th><th>Rate</th><th>Amount</th></tr></thead>',
    )
    parts.push('<tbody>')
    for (const line of section.lines) {
      parts.push(
        '<tr>' +
          `<td>${escapeHtml(line.description)}</td>` +
          `<td>${escapeHtml(line.qty)}</td>` +
          `<td>${escapeHtml(line.unit)}</td>` +
          `<td>${line.lengthFt == null ? '' : escapeHtml(line.lengthFt)}</td>` +
          `<td>${escapeHtml(sgd(line.rate))}</td>` +
          `<td>${escapeHtml(sgd(line.amount))}</td>` +
          '</tr>',
      )
    }
    parts.push('</tbody>')
    parts.push(
      `<tfoot><tr><th colspan="5">Subtotal</th><td>${escapeHtml(sgd(section.subtotal))}</td></tr></tfoot>`,
    )
    parts.push('</table>')
  }
  parts.push(`<p class="boq-total"><strong>Grand Total:</strong> ${escapeHtml(sgd(boq.total))}</p>`)
  parts.push('</section>')
  return parts.join('\n')
}
