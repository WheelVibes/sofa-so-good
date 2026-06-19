/**
 * Unit tests for quoteTemplate.ts — the pure template helpers.
 */

import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { type BoqInput, boqToCsv, boqToHtml, buildBoq } from './boq'
import { boqRows, boqToXlsx } from './boqXlsx'
import {
  applyTemplate,
  DEFAULT_QUOTE_TEMPLATE,
  escapeTemplateText,
  isNonDefaultTemplate,
  mergeTemplate,
  type QuoteTemplate,
  templateCurrencyFormatter,
} from './quoteTemplate'

const plan: FloorPlan = {
  id: 'p1',
  name: '4-Room HDB',
  ceilingHeight: 2.6,
  extent: [10, 8],
  walls: [],
  openings: [],
  rooms: [],
}

const sampleInput: BoqInput = {
  plan,
  furniture: [{ name: 'Sofa', qty: 1, unitPrice: 1000 }],
  finishes: {
    floorByFinish: [{ name: 'Vinyl', areaSqm: 50, ratePerSqm: 8 }],
    wallByFinish: [{ name: 'Paint', areaSqm: 100, ratePerSqm: 3 }],
  },
  carpentry: [{ name: 'Cabinet', lengthM: 3, ratePerM: 300 }],
}

// Sofa: 1000, Vinyl: 400, Paint: 300, Cabinet: 900 → total 2600
const BASE_TOTAL = 2600

describe('DEFAULT_QUOTE_TEMPLATE', () => {
  it('does not filter any sections or add adjustment rows — same total as raw boq', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, DEFAULT_QUOTE_TEMPLATE)

    // Same sections (all four visible), same total, no adjustment rows.
    expect(applied.sections.length).toBe(boq.sections.length)
    expect(applied.total).toBe(boq.total)
    expect(applied.total).toBe(BASE_TOTAL)
  })

  it('does not add company/note/footer blocks to HTML when all fields are empty', () => {
    const boq = buildBoq(sampleInput)
    const html = boqToHtml(applyTemplate(boq, DEFAULT_QUOTE_TEMPLATE), DEFAULT_QUOTE_TEMPLATE)
    expect(html).not.toContain('boq-company')
    expect(html).not.toContain('boq-contact')
    expect(html).not.toContain('boq-header-note')
    expect(html).not.toContain('boq-footer-note')
    // Core output elements are still present.
    expect(html).toContain('Grand Total')
    expect(html).toContain('Bill of Quantities')
  })

  it('does not add extra rows to CSV when all fields are empty', () => {
    const boq = buildBoq(sampleInput)
    const csvNoTemplate = boqToCsv(boq)
    const csvDefault = boqToCsv(applyTemplate(boq, DEFAULT_QUOTE_TEMPLATE), DEFAULT_QUOTE_TEMPLATE)
    // Same row count (no extra header/footer rows).
    const rowsA = csvNoTemplate.split('\r\n')
    const rowsB = csvDefault.split('\r\n')
    // The currency header column names may differ (SGD vs SGD) but row count is the same.
    expect(rowsB.length).toBe(rowsA.length)
    expect(rowsB[rowsB.length - 1]).toContain('Grand Total')
  })
})

describe('isNonDefaultTemplate', () => {
  it('returns false for the default template', () => {
    expect(isNonDefaultTemplate(DEFAULT_QUOTE_TEMPLATE)).toBe(false)
  })

  it('returns true when any field differs', () => {
    expect(isNonDefaultTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME' })).toBe(true)
    expect(isNonDefaultTemplate({ ...DEFAULT_QUOTE_TEMPLATE, gstPercent: 9 })).toBe(true)
    expect(isNonDefaultTemplate({ ...DEFAULT_QUOTE_TEMPLATE, showFfe: false })).toBe(true)
  })
})

describe('mergeTemplate', () => {
  it('fills missing fields from DEFAULT_QUOTE_TEMPLATE', () => {
    const merged = mergeTemplate({ companyName: 'ACME' })
    expect(merged.companyName).toBe('ACME')
    expect(merged.currencyLabel).toBe('SGD')
    expect(merged.showFfe).toBe(true)
  })
})

describe('templateCurrencyFormatter', () => {
  it('formats using the template currency label', () => {
    const fmt = templateCurrencyFormatter({ ...DEFAULT_QUOTE_TEMPLATE, currencyLabel: 'MYR' })
    expect(fmt(1234.5)).toBe('MYR$1,234.50')
    expect(fmt(0)).toBe('MYR$0.00')
    expect(fmt(-50)).toBe('-MYR$50.00')
  })

  it('falls back to SGD when currencyLabel is empty', () => {
    const fmt = templateCurrencyFormatter({ ...DEFAULT_QUOTE_TEMPLATE, currencyLabel: '' })
    expect(fmt(100)).toBe('SGD$100.00')
  })
})

describe('escapeTemplateText', () => {
  it('HTML-escapes special characters', () => {
    expect(escapeTemplateText('A & B <c> "d" \'e\'')).toBe(
      'A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;',
    )
  })

  it('converts numbers to string', () => {
    expect(escapeTemplateText(42)).toBe('42')
  })
})

describe('applyTemplate — section filtering', () => {
  it('hides the FF&E section when showFfe is false', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, showFfe: false })
    expect(applied.sections.some((s) => s.title.startsWith('FF&E'))).toBe(false)
    // Total no longer includes the Sofa cost.
    expect(applied.total).toBeLessThan(BASE_TOTAL)
  })

  it('hides Flooring when showFloor is false', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, showFloor: false })
    expect(applied.sections.some((s) => s.title === 'Flooring')).toBe(false)
    expect(applied.total).toBe(BASE_TOTAL - 400) // 400 = 50 * 8
  })

  it('hides Wall Finishes when showWall is false', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, showWall: false })
    expect(applied.sections.some((s) => s.title === 'Wall Finishes')).toBe(false)
  })

  it('hides Carpentry when showCarpentry is false', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, showCarpentry: false })
    expect(applied.sections.some((s) => s.title === 'Carpentry')).toBe(false)
  })

  it('returns zero sections and zero total when all sections are hidden', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, {
      ...DEFAULT_QUOTE_TEMPLATE,
      showFfe: false,
      showFloor: false,
      showWall: false,
      showCarpentry: false,
    })
    expect(applied.sections).toHaveLength(0)
    expect(applied.total).toBe(0)
  })
})

describe('applyTemplate — markup / discount / GST', () => {
  it('adds a markup section and increases the total', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, markupPercent: 10 })
    const markup = applied.sections.find((s) => s.title.startsWith('Markup'))
    expect(markup).toBeDefined()
    expect(markup!.subtotal).toBeCloseTo(BASE_TOTAL * 0.1, 2)
    expect(applied.total).toBeCloseTo(BASE_TOTAL * 1.1, 2)
  })

  it('adds a discount section and decreases the total', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, discountPercent: 5 })
    const discount = applied.sections.find((s) => s.title.startsWith('Discount'))
    expect(discount).toBeDefined()
    expect(discount!.subtotal).toBeCloseTo(-BASE_TOTAL * 0.05, 2)
    expect(applied.total).toBeCloseTo(BASE_TOTAL * 0.95, 2)
  })

  it('adds a GST section based on post-markup-discount total', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, { ...DEFAULT_QUOTE_TEMPLATE, gstPercent: 9 })
    const gst = applied.sections.find((s) => s.title.startsWith('GST'))
    expect(gst).toBeDefined()
    expect(gst!.subtotal).toBeCloseTo(BASE_TOTAL * 0.09, 2)
    expect(applied.total).toBeCloseTo(BASE_TOTAL * 1.09, 2)
  })

  it('applies markup then discount then GST in order', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, {
      ...DEFAULT_QUOTE_TEMPLATE,
      markupPercent: 10,
      discountPercent: 5,
      gstPercent: 9,
    })
    // After markup: 2600 * 1.1 = 2860
    // After discount: 2860 * 0.95 = 2717
    // After GST: 2717 * 1.09 = 2961.53
    expect(applied.total).toBeCloseTo(2600 * 1.1 * 0.95 * 1.09, 0)
  })

  it('omits 0% markup/discount/GST rows', () => {
    const boq = buildBoq(sampleInput)
    const applied = applyTemplate(boq, DEFAULT_QUOTE_TEMPLATE)
    expect(applied.sections.some((s) => s.title.startsWith('Markup'))).toBe(false)
    expect(applied.sections.some((s) => s.title.startsWith('Discount'))).toBe(false)
    expect(applied.sections.some((s) => s.title.startsWith('GST'))).toBe(false)
  })
})

describe('boqToHtml with template', () => {
  it('includes company name and contact line when set', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      companyName: 'ACME Interior Design',
      contactLine: '123 Main St',
    }
    const html = boqToHtml(applyTemplate(boq, t), t)
    expect(html).toContain('boq-company')
    expect(html).toContain('ACME Interior Design')
    expect(html).toContain('boq-contact')
    expect(html).toContain('123 Main St')
  })

  it('HTML-escapes company name with special characters', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      companyName: 'A&B <Design>',
    }
    const html = boqToHtml(applyTemplate(boq, t), t)
    expect(html).toContain('A&amp;B &lt;Design&gt;')
    expect(html).not.toContain('<Design>')
  })

  it('includes header and footer notes when set', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      headerNote: 'Valid for 30 days',
      footerNote: 'GST not included',
    }
    const html = boqToHtml(applyTemplate(boq, t), t)
    expect(html).toContain('boq-header-note')
    expect(html).toContain('Valid for 30 days')
    expect(html).toContain('boq-footer-note')
    expect(html).toContain('GST not included')
  })

  it('omits company/contact/notes blocks when empty', () => {
    const boq = buildBoq(sampleInput)
    const html = boqToHtml(applyTemplate(boq, DEFAULT_QUOTE_TEMPLATE), DEFAULT_QUOTE_TEMPLATE)
    expect(html).not.toContain('boq-company')
    expect(html).not.toContain('boq-contact')
    expect(html).not.toContain('boq-header-note')
    expect(html).not.toContain('boq-footer-note')
  })
})

describe('boqToCsv with template', () => {
  it('prepends company + contact rows when set', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      companyName: 'ACME',
      contactLine: 'Singapore',
    }
    const csv = boqToCsv(applyTemplate(boq, t), t)
    expect(csv).toContain('ACME')
    expect(csv).toContain('Singapore')
  })

  it('appends a footer note row', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      footerNote: 'Terms apply',
    }
    const csv = boqToCsv(applyTemplate(boq, t), t)
    const last = csv.split('\r\n').slice(-1)[0]!
    expect(last).toContain('Terms apply')
  })

  it('uses the custom currency label in column headers', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = { ...DEFAULT_QUOTE_TEMPLATE, currencyLabel: 'MYR' }
    const csv = boqToCsv(applyTemplate(boq, t), t)
    expect(csv).toContain('Rate (MYR)')
    expect(csv).toContain('Amount (MYR)')
  })
})

describe('boqRows (XLSX) with template', () => {
  it('prepends company rows and appends footer when set', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      companyName: 'ACME',
      footerNote: 'Terms',
    }
    const rows = boqRows(applyTemplate(boq, t), t)
    expect(rows[0]).toContain('ACME')
    const last = rows[rows.length - 1]!
    expect(last).toContain('Terms')
  })

  it('produces a valid xlsx workbook with template branding', () => {
    const boq = buildBoq(sampleInput)
    const t: QuoteTemplate = { ...DEFAULT_QUOTE_TEMPLATE, companyName: 'My Company' }
    const bytes = boqToXlsx(applyTemplate(boq, t), t)
    const files = unzipSync(bytes)
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('My Company')
  })
})

describe('Simple vs Pro mode gate (feature flag tier)', () => {
  // The quoteTemplate flag is tier:pro, so it must be hidden in Simple and
  // present in Pro. This is tested at the flag resolution level (featureFlags.ts),
  // not at the UI level, since we don't render React components here.
  it('quoteTemplate is in the FEATURE_FLAGS registry', async () => {
    const { FEATURE_FLAGS } = await import('../features/featureFlags')
    expect(FEATURE_FLAGS.quoteTemplate).toBeDefined()
    expect(FEATURE_FLAGS.quoteTemplate.tier).toBe('pro')
    expect(FEATURE_FLAGS.quoteTemplate.default).toBe(true)
  })

  it('is hidden in Simple mode and visible in Pro mode', async () => {
    const { resolveFlags } = await import('../features/featureFlags')
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    const simple = resolveFlags(true, {}, false, 'simple')
    const pro = resolveFlags(true, {}, false, 'pro')
    expect(simple.quoteTemplate).toBe(false)
    expect(pro.quoteTemplate).toBe(true)
  })
})
