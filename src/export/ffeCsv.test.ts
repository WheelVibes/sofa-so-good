import { describe, expect, it } from 'vitest'
import type { FfeRow } from '../ffe/ffeSchedule'
import { buildFfeCsv, customMetaColumns } from './ffeCsv'

const row = (over: Partial<FfeRow> = {}): FfeRow => ({
  room: 'Living',
  category: 'sofa',
  name: 'Sofa',
  source: 'Built-in',
  sku: '',
  w: 2,
  d: 0.9,
  h: 0.8,
  qty: 1,
  unit: 1200,
  total: 1200,
  url: '',
  remarks: '',
  brand: '',
  model: '',
  supplier: '',
  custom: {},
  ...over,
})

/** Parse a CRLF CSV into rows of cells. Fixture text never contains embedded
 *  newlines, so a naive split is sufficient. */
function parse(csv: string): string[][] {
  return csv.split('\r\n').map((line) => line.split(','))
}

describe('buildFfeCsv', () => {
  it('emits a header, one row per item, and a grand-total footer (metric)', () => {
    const csv = buildFfeCsv(
      [
        row({ room: 'Living', name: 'Sofa', source: 'Built-in', qty: 1, unit: 1200, total: 1200 }),
        row({
          room: 'Kitchen',
          name: 'Chair',
          source: 'IKEA',
          sku: '802.123.45',
          w: 0.5,
          d: 0.5,
          h: 0.9,
          qty: 4,
          unit: 50,
          total: 200,
        }),
      ],
      'metric',
    )
    const rows = parse(csv)
    expect(rows[0]).toEqual([
      'Room',
      'Item',
      'Source',
      'SKU',
      'Size (W×D×H)',
      'Qty',
      'Unit price',
      'Line total',
    ])
    // 2 item rows + 1 footer
    expect(rows).toHaveLength(4)
    expect(rows[1]).toEqual([
      'Living',
      'Sofa',
      'Built-in',
      '',
      '200 × 90 × 80 cm',
      '1',
      '1200',
      '1200',
    ])
    expect(rows[2][3]).toBe('802.123.45')
    expect(rows[2][5]).toBe('4')
    expect(rows[2][7]).toBe('200')
    // Grand-total footer: item count + summed line total (1200 + 200 = 1400).
    expect(rows[3][0]).toBe('Total (2 items)')
    expect(rows[3][7]).toBe('1400')
  })

  it('formats the size column in imperial when asked', () => {
    const csv = buildFfeCsv([row({ w: 2, d: 0.9, h: 0.8 })], 'imperial')
    const rows = parse(csv)
    expect(rows[1][4]).toContain('″') // inches
    expect(rows[1][4]).not.toContain('cm')
  })

  it('RFC-4180 quotes commas + neutralises CSV-injection in item / room names', () => {
    const csv = buildFfeCsv(
      [
        row({
          room: 'Living, Dining',
          // A name beginning with '=' is a live formula in Excel.
          name: '=cmd|calc',
          source: 'Custom',
        }),
      ],
      'metric',
    )
    expect(csv).toContain('"Living, Dining"') // comma → quoted
    expect(csv).toContain("'=cmd|calc") // formula lead neutralised with a quote
  })

  it('singular footer label for a single item', () => {
    const csv = buildFfeCsv([row()], 'metric')
    expect(parse(csv)[2][0]).toBe('Total (1 item)')
  })

  it('blanks the price columns + total when prices are disabled, keeps size/qty', () => {
    const csv = buildFfeCsv([row({ qty: 2, unit: 100, total: 200 })], 'metric', { prices: false })
    const rows = parse(csv)
    expect(rows[1][5]).toBe('2') // qty kept
    expect(rows[1][4]).toContain('cm') // size kept
    expect(rows[1][6]).toBe('') // unit price blank
    expect(rows[1][7]).toBe('') // line total blank
    expect(rows[2][7]).toBe('') // footer total blank
  })

  it('empty schedule yields just the header + a zero-item total footer', () => {
    const csv = buildFfeCsv([], 'metric')
    const rows = parse(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('Total (0 items)')
    expect(rows[1][7]).toBe('0')
  })

  it('omits the Brand/Model/Supplier/URL/Remarks columns entirely when no row carries any (ITEM-META)', () => {
    const csv = buildFfeCsv([row(), row()], 'metric')
    const rows = parse(csv)
    expect(rows[0]).toHaveLength(8)
    expect(rows[0]).not.toContain('URL')
    expect(rows[0]).not.toContain('Brand')
    expect(rows[1]).toHaveLength(8)
  })

  it('appends the ITEM-META block for every row once any row carries any of it', () => {
    const csv = buildFfeCsv(
      [
        row({
          url: 'https://example.com/sofa',
          remarks: 'existing — retain',
          brand: 'Acme',
          model: 'X-100',
          supplier: 'Acme Direct',
        }),
        row({ name: 'Chair' }), // no metadata of its own — still gets blank cells
      ],
      'metric',
    )
    const rows = parse(csv)
    expect(rows[0].slice(-5)).toEqual(['Brand', 'Model', 'Supplier', 'URL', 'Remarks'])
    expect(rows[1].slice(-5)).toEqual([
      'Acme',
      'X-100',
      'Acme Direct',
      'https://example.com/sofa',
      'existing — retain',
    ])
    expect(rows[2].slice(-5)).toEqual(['', '', '', '', ''])
    // Footer row keeps the trailing cells blank too.
    expect(rows[3].slice(-5)).toEqual(['', '', '', '', ''])
  })

  describe('custom fields (ITEM-META `meta.custom`)', () => {
    it('customMetaColumns returns every distinct key, alphabetical, across overlapping + disjoint items', () => {
      const cols = customMetaColumns([
        row({ custom: { Fabric: 'Linen', Warranty: '2 years' } }),
        row({ custom: { Fabric: 'Velvet', Origin: 'Italy' } }), // overlapping (Fabric) + disjoint (Origin)
      ])
      expect(cols).toEqual(['Fabric', 'Origin', 'Warranty'])
    })

    it('customMetaColumns is [] when no row carries any custom field', () => {
      expect(customMetaColumns([row(), row()])).toEqual([])
    })

    it('appends one column per distinct custom key, blank where an item lacks it', () => {
      const csv = buildFfeCsv(
        [
          row({ name: 'Sofa', custom: { Fabric: 'Linen', Warranty: '2 years' } }),
          row({ name: 'Chair', custom: { Fabric: 'Velvet' } }), // no Warranty
          row({ name: 'Lamp' }), // no custom fields at all
        ],
        'metric',
      )
      const rows = parse(csv)
      expect(rows[0].slice(-2)).toEqual(['Fabric', 'Warranty'])
      expect(rows[1].slice(-2)).toEqual(['Linen', '2 years'])
      expect(rows[2].slice(-2)).toEqual(['Velvet', ''])
      expect(rows[3].slice(-2)).toEqual(['', ''])
      // Footer row keeps the trailing cells blank too.
      expect(rows[4].slice(-2)).toEqual(['', ''])
    })

    it('custom columns follow the fixed Brand/Model/Supplier/URL/Remarks block when both are present', () => {
      const csv = buildFfeCsv([row({ brand: 'Acme', custom: { Fabric: 'Linen' } })], 'metric')
      const rows = parse(csv)
      expect(rows[0].slice(-6)).toEqual(['Brand', 'Model', 'Supplier', 'URL', 'Remarks', 'Fabric'])
    })
  })
})
