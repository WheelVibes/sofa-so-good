import { describe, expect, it } from 'vitest'
import { csvNumberField, csvSafeField } from './csv'

describe('csvSafeField', () => {
  it('leaves normal text unchanged', () => {
    expect(csvSafeField('3-seat sofa')).toBe('3-seat sofa')
    expect(csvSafeField('KIVIK (grey)')).toBe('KIVIK (grey)')
    expect(csvSafeField('Living')).toBe('Living')
  })

  it('returns an empty field unchanged', () => {
    expect(csvSafeField('')).toBe('')
  })

  it('neutralises leading formula characters with a single quote', () => {
    // Contains a `"`, so the guard prefix is applied then RFC-4180 quoting wraps it.
    expect(csvSafeField('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"')
    expect(csvSafeField('=cmd')).toBe("'=cmd")
    expect(csvSafeField('+1+2')).toBe("'+1+2")
    expect(csvSafeField('-cmd')).toBe("'-cmd")
    expect(csvSafeField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvSafeField('\tTabbed')).toBe("'\tTabbed")
    // A leading CR is both a formula lead AND triggers RFC-4180 quoting.
    expect(csvSafeField('\rCarriage')).toBe('"\'\rCarriage"')
  })

  it('still neutralises when the dangerous char hides behind a leading quote', () => {
    // A leading double-quote could otherwise smuggle a formula past a naive guard.
    expect(csvSafeField('"=cmd')).toBe('"\'""=cmd"')
  })

  it('does NOT prefix when the leading char is benign even if a formula char follows', () => {
    expect(csvSafeField('A=B')).toBe('A=B')
    expect(csvSafeField('total -5')).toBe('total -5')
    // Leading whitespace then `=` is treated as text (space is not a formula lead).
    expect(csvSafeField(' =cmd')).toBe(' =cmd')
  })

  it('applies RFC-4180 quoting for commas, quotes and newlines', () => {
    expect(csvSafeField('Coffee table, oak')).toBe('"Coffee table, oak"')
    expect(csvSafeField('Vase 12"')).toBe('"Vase 12"""')
    expect(csvSafeField('Den\nNook')).toBe('"Den\nNook"')
  })

  it('combines the formula guard with RFC-4180 quoting', () => {
    // `=1,2` is dangerous (leading `=`) AND contains a comma → guard then quote.
    expect(csvSafeField('=1,2')).toBe('"\'=1,2"')
  })

  it('handles unicode and very long fields', () => {
    expect(csvSafeField('客厅')).toBe('客厅')
    const long = 'x'.repeat(5000)
    expect(csvSafeField(long)).toBe(long)
    expect(csvSafeField(`=${long}`)).toBe(`'=${long}`)
  })

  it('stringifies numbers passed as text fields', () => {
    expect(csvSafeField(42)).toBe('42')
  })
})

describe('csvNumberField', () => {
  it('emits genuine numbers verbatim, including negatives', () => {
    expect(csvNumberField(1300)).toBe('1300')
    expect(csvNumberField(-5)).toBe('-5')
    expect(csvNumberField(12.5)).toBe('12.5')
    expect(csvNumberField(0)).toBe('0')
  })

  it('falls back to an empty cell for non-finite values', () => {
    expect(csvNumberField(Number.NaN)).toBe('')
    expect(csvNumberField(Number.POSITIVE_INFINITY)).toBe('')
  })
})
