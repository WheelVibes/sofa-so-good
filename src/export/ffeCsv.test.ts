import { describe, expect, it } from 'vitest'
import type { FfeRow } from '../ffe/ffeSchedule'
import { buildFfeCsv } from './ffeCsv'

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
})
