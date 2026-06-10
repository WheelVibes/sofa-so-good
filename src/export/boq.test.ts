import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { type BoqInput, boqToCsv, boqToHtml, buildBoq, M_TO_FT, sgd } from './boq'

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
  rooms: [{ id: 'living', name: 'Living', floorArea: 24, floorFinishName: 'Oak' }],
  furniture: [
    { name: 'Sofa, 3-seater', category: 'Seating', qty: 1, unitPrice: 1200 },
    { name: 'Dining chair', qty: 6, unitPrice: 150 },
  ],
  finishes: {
    floorByFinish: [{ name: 'Vinyl plank', areaSqm: 50, ratePerSqm: 8 }],
    wallByFinish: [{ name: 'Emulsion paint', areaSqm: 120, ratePerSqm: 3.5 }],
  },
  carpentry: [{ name: 'Kitchen cabinet', lengthM: 4, ratePerM: 350 }],
}

describe('buildBoq', () => {
  it('produces the expected section subtotals and grand total', () => {
    const boq = buildBoq(sampleInput)
    const byTitle = Object.fromEntries(boq.sections.map((s) => [s.title, s]))

    // FF&E: 1*1200 + 6*150 = 2100
    expect(byTitle['FF&E (Furniture, Fixtures & Equipment)'].subtotal).toBe(2100)
    // Flooring: 50 * 8 = 400
    expect(byTitle['Flooring'].subtotal).toBe(400)
    // Wall: 120 * 3.5 = 420
    expect(byTitle['Wall Finishes'].subtotal).toBe(420)
    // Carpentry: 4 * 350 = 1400
    expect(byTitle['Carpentry'].subtotal).toBe(1400)

    expect(boq.total).toBe(2100 + 400 + 420 + 1400)
    expect(boq.planName).toBe('4-Room HDB')
  })

  it('sets per-line amount = qty * rate and includes category in description', () => {
    const boq = buildBoq(sampleInput)
    const ffe = boq.sections.find((s) => s.title.startsWith('FF&E'))!
    expect(ffe.lines[0]).toMatchObject({
      description: 'Sofa, 3-seater (Seating)',
      qty: 1,
      unit: 'no.',
      rate: 1200,
      amount: 1200,
    })
    expect(ffe.lines[1].amount).toBe(900)
    expect(ffe.lines[1].description).toBe('Dining chair')
  })

  it('computes carpentry linear-feet column ≈ metres × 3.28084', () => {
    const boq = buildBoq(sampleInput)
    const carp = boq.sections.find((s) => s.title === 'Carpentry')!
    expect(carp.lines[0].lengthFt).toBeCloseTo(4 * M_TO_FT, 2)
    expect(carp.lines[0].unit).toBe('lin.m')
  })

  it('omits missing/empty sections and returns zero total for empty input', () => {
    const boq = buildBoq({ plan })
    expect(boq.sections).toEqual([])
    expect(boq.total).toBe(0)
    expect(() => buildBoq({ plan })).not.toThrow()
  })

  it('omits a group whose array is present but empty', () => {
    const boq = buildBoq({ plan, furniture: [], carpentry: [] })
    expect(boq.sections).toEqual([])
    expect(boq.total).toBe(0)
  })

  it('handles zero rates without throwing', () => {
    const boq = buildBoq({
      plan,
      furniture: [{ name: 'Freebie', qty: 2, unitPrice: 0 }],
    })
    expect(boq.sections[0].lines[0].amount).toBe(0)
    expect(boq.total).toBe(0)
  })
})

describe('sgd', () => {
  it('formats SGD with grouping and two decimals', () => {
    expect(sgd(1234.5)).toBe('S$1,234.50')
    expect(sgd(0)).toBe('S$0.00')
    expect(sgd(-50)).toBe('-S$50.00')
    expect(sgd(Number.NaN)).toBe('S$0.00')
  })
})

describe('boqToCsv', () => {
  it('has a header plus a row per line and is RFC-4180 quoted', () => {
    const boq = buildBoq(sampleInput)
    const csv = boqToCsv(boq)
    const rows = csv.split('\r\n')

    expect(rows[0]).toBe('Section,Description,Qty,Unit,Length (ft),Rate (SGD),Amount (SGD)')

    // A name containing a comma must be quoted.
    expect(csv).toContain('"Sofa, 3-seater (Seating)"')

    // One data row per line + one subtotal row per section + one grand-total row.
    const lineCount = boq.sections.reduce((n, s) => n + s.lines.length, 0)
    expect(rows.length).toBe(1 + lineCount + boq.sections.length + 1)
    expect(rows[rows.length - 1]).toContain('Grand Total')
  })

  it('escapes embedded quotes by doubling them', () => {
    const boq = buildBoq({
      plan,
      furniture: [{ name: 'Shelf 12" deep', qty: 1, unitPrice: 100 }],
    })
    const csv = boqToCsv(boq)
    expect(csv).toContain('"Shelf 12"" deep"')
  })
})

describe('boqToHtml', () => {
  it('escapes < and " in content', () => {
    const boq = buildBoq({
      plan,
      furniture: [{ name: 'A <b> & "quote"', qty: 1, unitPrice: 10 }],
    })
    const html = boqToHtml(boq)
    expect(html).toContain('A &lt;b&gt; &amp; &quot;quote&quot;')
    expect(html).not.toContain('<b>')
    expect(html).toContain('Grand Total')
  })

  it('renders an empty-state message and zero total for empty input', () => {
    const html = boqToHtml(buildBoq({ plan }))
    expect(html).toContain('No items.')
    expect(html).toContain('S$0.00')
    expect(() => boqToHtml(buildBoq({ plan }))).not.toThrow()
  })
})
