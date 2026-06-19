import { describe, expect, it } from 'vitest'
import type { FfeRow } from '../ffe/ffeSchedule'
import { buildFurnitureCsv } from './furnitureCsv'

function row(over: Partial<FfeRow> = {}): FfeRow {
  return {
    room: 'Living',
    category: 'seating',
    name: '3-seat sofa',
    source: 'Built-in',
    sku: '',
    w: 2.1,
    d: 0.9,
    h: 0.85,
    qty: 1,
    unit: 1200,
    total: 1200,
    ...over,
  }
}

const HEADER = 'Room,Item,Source,SKU,Width(mm),Depth(mm),Height(mm),Qty,Unit price,Total'

describe('buildFurnitureCsv', () => {
  it('emits a header, one row per item, and a grand-total footer', () => {
    const csv = buildFurnitureCsv([
      row(),
      row({ room: 'Kitchen', name: 'Stool', w: 0.4, d: 0.4, h: 0.6, qty: 2, unit: 50, total: 100 }),
    ])
    const rows = csv.split('\r\n')
    expect(rows[0]).toBe(HEADER)
    // Dimensions are metres → whole millimetres.
    expect(rows[1]).toBe('Living,3-seat sofa,Built-in,,2100,900,850,1,1200,1200')
    expect(rows[2]).toBe('Kitchen,Stool,Built-in,,400,400,600,2,50,100')
    // Footer carries the grand total in the Total column.
    expect(rows[3]).toBe(',Total,,,,,,,,1300')
    expect(rows).toHaveLength(4)
  })

  it('CSV-escapes fields containing commas, quotes and newlines', () => {
    const csv = buildFurnitureCsv([
      row({ name: 'Coffee table, oak' }),
      row({ name: 'Vase 12"' }),
      row({ room: 'Den\nNook' }),
    ])
    expect(csv).toContain('Living,"Coffee table, oak",Built-in,')
    expect(csv).toContain('Living,"Vase 12""",Built-in,')
    expect(csv).toContain('"Den\nNook",3-seat sofa,Built-in,')
  })

  it('rounds prices and dimensions to whole units', () => {
    const csv = buildFurnitureCsv([
      row({ w: 1.234, d: 0.5678, h: 0.9, unit: 12.6, total: 25.4, qty: 2 }),
    ])
    const cells = csv.split('\r\n')[1].split(',')
    expect(cells[4]).toBe('1234') // width mm
    expect(cells[5]).toBe('568') // depth mm (rounded)
    expect(cells[8]).toBe('13') // unit price
    expect(cells[9]).toBe('25') // line total
  })

  it('preserves the SKU and source columns (IKEA variant rows)', () => {
    const csv = buildFurnitureCsv([
      row({ name: 'KIVIK (grey)', source: 'IKEA', sku: '193.846.45' }),
    ])
    expect(csv).toContain('Living,KIVIK (grey),IKEA,193.846.45,')
  })

  it('neutralises CSV formula injection in user text (SEC-002)', () => {
    const csv = buildFurnitureCsv([
      row({ name: '=HYPERLINK("http://evil")', source: '@evil', room: '-cmd' }),
    ])
    const dataRow = csv.split('\r\n')[1]
    // Each dangerous text field is prefixed with a single quote (item also RFC-4180 quoted).
    expect(dataRow).toContain("'-cmd")
    expect(dataRow).toContain('"\'=HYPERLINK(""http://evil"")"')
    expect(dataRow).toContain("'@evil")
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/)
    // Numeric columns remain bare numbers.
    expect(dataRow).toContain(',2100,900,850,1,1200,1200')
  })

  it('handles an empty design — header plus a zero total', () => {
    const csv = buildFurnitureCsv([])
    const rows = csv.split('\r\n')
    expect(rows[0]).toBe(HEADER)
    expect(rows[1]).toBe(',Total,,,,,,,,0')
    expect(rows).toHaveLength(2)
  })
})
