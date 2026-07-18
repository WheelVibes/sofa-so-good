import { describe, expect, it } from 'vitest'
import { permitNotes } from './permitNotes'

describe('permitNotes', () => {
  it('renders the HDB permit path for HDB', () => {
    const lines = permitNotes('HDB')
    const joined = lines.join(' ')
    expect(joined).toContain('HDB permit')
    expect(joined).toContain('Professional Engineer')
    expect(joined).not.toContain('MCST')
    expect(joined).not.toContain('BCA-direct')
  })

  it('falls back to the HDB text when housingType is absent (back-compat)', () => {
    expect(permitNotes(undefined)).toEqual(permitNotes('HDB'))
  })

  it('renders the MCST / building-management path for Condominium, no HDB permit language', () => {
    const lines = permitNotes('Condominium')
    const joined = lines.join(' ')
    expect(joined).toContain('MCST')
    expect(joined).toContain('BCA')
    expect(joined).not.toContain('HDB permit')
    expect(joined).not.toContain('written HDB permit')
  })

  it('renders the BCA-direct path for Landed, no HDB/MCST language', () => {
    const lines = permitNotes('Landed')
    const joined = lines.join(' ')
    expect(joined).toContain('BCA')
    expect(joined).toContain('Professional Engineer')
    expect(joined).not.toContain('written HDB permit')
    expect(joined).not.toContain('MCST / building management')
  })

  it('every housing type keeps the LEW/PUB lines', () => {
    for (const type of ['HDB', 'Condominium', 'Landed'] as const) {
      const joined = permitNotes(type).join(' ')
      expect(joined).toContain('EMA-Licensed Electrical Worker')
      expect(joined).toContain('PUB Licensed Plumber')
    }
  })

  it('keeps every note block to a concise 6-7 line budget', () => {
    for (const type of ['HDB', 'Condominium', 'Landed'] as const) {
      expect(permitNotes(type).length).toBeLessThanOrEqual(8)
      expect(permitNotes(type).length).toBeGreaterThanOrEqual(6)
    }
  })
})
