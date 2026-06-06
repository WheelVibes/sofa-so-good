import { describe, expect, it } from 'vitest'
import { buildShoppingCsv, type CsvLine } from './shoppingCsv'

const lines: CsvLine[] = [
  { category: 'Seating', item: '3-seat sofa', qty: 1, unit: 1200, total: 1200 },
  { category: 'Tables', item: 'Coffee table, oak', qty: 2, unit: 150, total: 300 },
]

describe('buildShoppingCsv', () => {
  it('emits a header, one row per line, and a total footer', () => {
    const csv = buildShoppingCsv(lines, 1500)
    const rows = csv.split('\r\n')
    expect(rows[0]).toBe('Category,Item,Quantity,Unit price (SGD),Line total (SGD)')
    expect(rows[1]).toBe('Seating,3-seat sofa,1,1200,1200')
    expect(rows[3]).toBe(',,,Total,1500')
  })

  it('quotes fields containing commas', () => {
    const csv = buildShoppingCsv(lines, 1500)
    expect(csv).toContain('Tables,"Coffee table, oak",2,150,300')
  })

  it('escapes embedded quotes', () => {
    const csv = buildShoppingCsv(
      [{ category: 'Decor', item: 'Vase 12"', qty: 1, unit: 20, total: 20 }],
      20,
    )
    expect(csv).toContain('Decor,"Vase 12""",1,20,20')
  })

  it('rounds prices to whole SGD', () => {
    const csv = buildShoppingCsv(
      [{ category: 'X', item: 'Y', qty: 1, unit: 12.6, total: 12.6 }],
      12.6,
    )
    expect(csv).toContain('X,Y,1,13,13')
  })
})
