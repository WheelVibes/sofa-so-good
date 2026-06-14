import { describe, expect, it } from 'vitest'
import { comboRows } from './FuzzyCombo'

const PROJECTS = ['Serangoon North Vista', 'Tampines GreenVerge', 'Bishan Ridges', 'Sky Habitat']

describe('comboRows', () => {
  it('empty query lists all options, no custom row', () => {
    const rows = comboRows('', PROJECTS)
    expect(rows.map((r) => r.value)).toEqual(PROJECTS)
    expect(rows.some((r) => r.custom)).toBe(false)
  })

  it('fuzzy-ranks matches best-first and appends an Add-custom row last', () => {
    const rows = comboRows('serang', PROJECTS)
    expect(rows[0].value).toBe('Serangoon North Vista')
    const last = rows[rows.length - 1]
    expect(last.custom).toBe(true)
    expect(last.value).toBe('serang')
    expect(last.label).toContain('serang')
  })

  it('no custom row when the query exactly matches an existing option (case-insensitive)', () => {
    const rows = comboRows('sky habitat', PROJECTS)
    expect(rows.some((r) => r.custom)).toBe(false)
    expect(rows[0].value).toBe('Sky Habitat')
  })

  it('a brand-new value yields only the Add-custom row', () => {
    const rows = comboRows('Punggol Coast Edge', PROJECTS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ custom: true, value: 'Punggol Coast Edge' })
  })

  it('trims the custom value', () => {
    const rows = comboRows('  2-Room + Study  ', [])
    expect(rows).toEqual([{ label: 'Add “2-Room + Study”', value: '2-Room + Study', custom: true }])
  })
})
