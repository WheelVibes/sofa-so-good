import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Boq } from './boq'
import { boqRows, boqToXlsx, columnLetter } from './boqXlsx'

const boq: Boq = {
  planName: 'Test Flat',
  sections: [
    {
      title: 'Furniture (FF&E)',
      lines: [
        { description: '3-seat sofa', qty: 1, unit: 'no', rate: 1200, amount: 1200 },
        { description: 'Dining chair', qty: 4, unit: 'no', rate: 150, amount: 600 },
      ],
      subtotal: 1800,
    },
  ],
  total: 1800,
}

describe('columnLetter', () => {
  it('maps 0-based indices to spreadsheet letters', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(6)).toBe('G')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
  })
})

describe('boqRows', () => {
  it('emits a header, each line, a subtotal, and the grand total', () => {
    const rows = boqRows(boq)
    expect(rows[0]).toEqual([
      'Section',
      'Description',
      'Qty',
      'Unit',
      'Length (ft)',
      'Rate (SGD)',
      'Amount (SGD)',
    ])
    expect(rows.some((r) => r[1] === '3-seat sofa' && r[6] === 1200)).toBe(true)
    expect(rows.some((r) => r[1] === 'Subtotal' && r[6] === 1800)).toBe(true)
    expect(rows[rows.length - 1]).toEqual(['', 'Grand Total', '', '', '', '', 1800])
  })
})

describe('boqToXlsx (PARITY-QUOTEXLSX)', () => {
  it('produces a valid single-sheet workbook with the required OOXML parts', () => {
    const files = unzipSync(boqToXlsx(boq))
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(files[part]).toBeDefined()
    }
    // Begins with the ZIP local-file-header magic "PK\x03\x04".
    const bytes = boqToXlsx(boq)
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('writes the data into the worksheet (inline-string text + numeric cells)', () => {
    const files = unzipSync(boqToXlsx(boq))
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('Amount (SGD)') // header
    expect(sheet).toContain('3-seat sofa') // a line description
    expect(sheet).toContain('<v>1200</v>') // a numeric amount cell
    // Header lives in row 1, cell A1.
    expect(sheet).toContain('r="A1"')
  })

  it('escapes XML-special characters in descriptions (e.g. the FF&E ampersand)', () => {
    const files = unzipSync(boqToXlsx(boq))
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('Furniture (FF&amp;E)')
    expect(sheet).not.toContain('FF&E)')
  })
})
