/**
 * User-editable quote template — company branding, notes, tax, markup/discount,
 * and section-visibility toggles for the BOQ export (CSV / HTML / XLSX).
 *
 * Pure and self-contained: no I/O, no store references. Designed to be
 * serialised into the save schema and applied on top of a `Boq` before
 * rendering. `DEFAULT_QUOTE_TEMPLATE` reproduces the exact output of the
 * original builders so behaviour is unchanged until a user edits settings.
 */

import type { Boq } from './boq'

/** User-editable branding / tax / section settings for a quote export. */
export interface QuoteTemplate {
  /** Company name shown at the top of the quote; empty = omit. */
  companyName: string
  /** Contact line (address / phone / email); empty = omit. */
  contactLine: string
  /** Header note shown before the section tables; empty = omit. */
  headerNote: string
  /** Footer / terms note shown after the grand total; empty = omit. */
  footerNote: string
  /** Currency label used in column headings (default 'SGD'). */
  currencyLabel: string
  /** GST / tax percentage (0 = omit the row). Applied after markup + discount. */
  gstPercent: number
  /** Markup percentage added to the subtotals before GST (0 = omit). */
  markupPercent: number
  /** Discount percentage deducted after markup, before GST (0 = omit). */
  discountPercent: number
  /** Show the FF&E (furniture) section. */
  showFfe: boolean
  /** Show the Flooring section. */
  showFloor: boolean
  /** Show the Wall Finishes section. */
  showWall: boolean
  /** Show the Carpentry section. */
  showCarpentry: boolean
}

/**
 * Reproduces the EXACT current output when applied — behaviour is unchanged
 * until the user edits at least one field.
 */
export const DEFAULT_QUOTE_TEMPLATE: QuoteTemplate = {
  companyName: '',
  contactLine: '',
  headerNote: '',
  footerNote: '',
  currencyLabel: 'SGD',
  gstPercent: 0,
  markupPercent: 0,
  discountPercent: 0,
  showFfe: true,
  showFloor: true,
  showWall: true,
  showCarpentry: true,
}

/** True when any field differs from the default (used to decide whether to
 *  persist the template in the save schema — omit when it's the default). */
export function isNonDefaultTemplate(t: QuoteTemplate): boolean {
  const d = DEFAULT_QUOTE_TEMPLATE
  return (
    t.companyName !== d.companyName ||
    t.contactLine !== d.contactLine ||
    t.headerNote !== d.headerNote ||
    t.footerNote !== d.footerNote ||
    t.currencyLabel !== d.currencyLabel ||
    t.gstPercent !== d.gstPercent ||
    t.markupPercent !== d.markupPercent ||
    t.discountPercent !== d.discountPercent ||
    t.showFfe !== d.showFfe ||
    t.showFloor !== d.showFloor ||
    t.showWall !== d.showWall ||
    t.showCarpentry !== d.showCarpentry
  )
}

/** Merge a partial serialised template with the default (fills in missing fields). */
export function mergeTemplate(partial: Partial<QuoteTemplate>): QuoteTemplate {
  return { ...DEFAULT_QUOTE_TEMPLATE, ...partial }
}

// ---------------------------------------------------------------------------
// Section filtering helpers

const FFE_TITLE_PREFIX = 'FF&E'
const FLOOR_TITLE = 'Flooring'
const WALL_TITLE = 'Wall Finishes'
const CARPENTRY_TITLE = 'Carpentry'

function isSectionVisible(title: string, t: QuoteTemplate): boolean {
  if (title.startsWith(FFE_TITLE_PREFIX)) return t.showFfe
  if (title === FLOOR_TITLE) return t.showFloor
  if (title === WALL_TITLE) return t.showWall
  if (title === CARPENTRY_TITLE) return t.showCarpentry
  // Unknown section (e.g. markup/GST rows added by applyTemplate itself) — always show.
  return true
}

// ---------------------------------------------------------------------------
// Monetary helpers

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Returns a currency formatter using the template's currencyLabel. */
export function templateCurrencyFormatter(t: QuoteTemplate): (n: number) => string {
  const label = t.currencyLabel || 'SGD'
  return (n: number) => {
    const safe = Number.isFinite(n) ? n : 0
    const neg = safe < 0
    const cents = Math.round(Math.abs(safe) * 100)
    const dollars = Math.floor(cents / 100)
    const frac = (cents % 100).toString().padStart(2, '0')
    const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `${neg ? '-' : ''}${label}$${grouped}.${frac}`
  }
}

// ---------------------------------------------------------------------------
// HTML escaping (reused from boq.ts approach)

/** Escape text for safe insertion into HTML or CSV content. */
export function escapeTemplateText(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// Core template application

/**
 * Apply the template to a raw `Boq`:
 *  1. Filter sections by visibility toggles.
 *  2. Add markup / discount / GST adjustment rows if their percentages are > 0.
 *  3. Recompute the grand total.
 *
 * When called with `DEFAULT_QUOTE_TEMPLATE` the result is identical to the
 * input (no sections filtered, no adjustment rows, same total).
 */
export function applyTemplate(boq: Boq, template: QuoteTemplate): Boq {
  // 1. Filter sections.
  const sections = boq.sections.filter((s) => isSectionVisible(s.title, template))

  // 2. Base subtotal across visible sections.
  let runningTotal = round2(sections.reduce((sum, s) => sum + s.subtotal, 0))

  const adjustments: Boq['sections'] = []

  // 2a. Markup.
  if (template.markupPercent > 0) {
    const pct = template.markupPercent
    const amount = round2(runningTotal * (pct / 100))
    adjustments.push({
      title: `Markup (${pct}%)`,
      lines: [{ description: `Markup (${pct}%)`, qty: 1, unit: '', rate: amount, amount }],
      subtotal: amount,
    })
    runningTotal = round2(runningTotal + amount)
  }

  // 2b. Discount.
  if (template.discountPercent > 0) {
    const pct = template.discountPercent
    const amount = round2(runningTotal * (pct / 100))
    adjustments.push({
      title: `Discount (${pct}%)`,
      lines: [
        {
          description: `Discount (${pct}%)`,
          qty: 1,
          unit: '',
          rate: -amount,
          amount: -amount,
        },
      ],
      subtotal: -amount,
    })
    runningTotal = round2(runningTotal - amount)
  }

  // 2c. GST.
  if (template.gstPercent > 0) {
    const pct = template.gstPercent
    const amount = round2(runningTotal * (pct / 100))
    adjustments.push({
      title: `GST (${pct}%)`,
      lines: [{ description: `GST (${pct}%)`, qty: 1, unit: '', rate: amount, amount }],
      subtotal: amount,
    })
    runningTotal = round2(runningTotal + amount)
  }

  return {
    planName: boq.planName,
    sections: [...sections, ...adjustments],
    total: runningTotal,
  }
}
