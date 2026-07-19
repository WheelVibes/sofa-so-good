import { describe, expect, it } from 'vitest'
import {
  addYears,
  buildHandoverDates,
  daysUntil,
  formatHandoverDate,
  isLeapYear,
  parseKeyDate,
} from './handoverDates'

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('parseKeyDate', () => {
  it('parses a valid yyyy-mm-dd to UTC midnight', () => {
    const d = parseKeyDate('2026-07-19')
    expect(d).not.toBeNull()
    expect(d?.getUTCFullYear()).toBe(2026)
    expect(d?.getUTCMonth()).toBe(6)
    expect(d?.getUTCDate()).toBe(19)
    expect(d?.getUTCHours()).toBe(0)
  })

  it('rejects malformed / empty / out-of-range / rolled-over dates', () => {
    expect(parseKeyDate('')).toBeNull()
    expect(parseKeyDate(null)).toBeNull()
    expect(parseKeyDate('19-07-2026')).toBeNull()
    expect(parseKeyDate('2026-13-01')).toBeNull()
    expect(parseKeyDate('2026-02-30')).toBeNull()
    expect(parseKeyDate('2025-02-29')).toBeNull() // not a leap year
  })
})

describe('isLeapYear', () => {
  it('follows the Gregorian rule', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2025)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2100)).toBe(false)
  })
})

describe('addYears (leap-year clamping)', () => {
  it('adds whole years for an ordinary date', () => {
    expect(iso(addYears(new Date(Date.UTC(2026, 6, 19)), 1))).toBe('2027-07-19')
    expect(iso(addYears(new Date(Date.UTC(2026, 6, 19)), 5))).toBe('2031-07-19')
    expect(iso(addYears(new Date(Date.UTC(2026, 6, 19)), 10))).toBe('2036-07-19')
  })

  it('clamps 29 Feb to 28 Feb when the target year is not a leap year', () => {
    // 2024-02-29 + 1yr → 2025 (non-leap) → 28 Feb
    expect(iso(addYears(new Date(Date.UTC(2024, 1, 29)), 1))).toBe('2025-02-28')
    // + 4yr → 2028 (leap) → keeps 29 Feb
    expect(iso(addYears(new Date(Date.UTC(2024, 1, 29)), 4))).toBe('2028-02-29')
  })
})

describe('daysUntil', () => {
  it('counts whole days, future positive / past negative / same-day zero', () => {
    const target = new Date(Date.UTC(2026, 6, 20))
    expect(daysUntil(target, new Date(Date.UTC(2026, 6, 19)))).toBe(1)
    expect(daysUntil(target, new Date(Date.UTC(2026, 6, 20)))).toBe(0)
    expect(daysUntil(target, new Date(Date.UTC(2026, 6, 25)))).toBe(-5)
  })

  it('ignores intraday time (UTC-midnight boundaries)', () => {
    const target = new Date(Date.UTC(2026, 6, 20))
    const nowLate = new Date(Date.UTC(2026, 6, 19, 23, 59))
    expect(daysUntil(target, nowLate)).toBe(1)
  })
})

describe('buildHandoverDates', () => {
  it('returns null without a valid date', () => {
    expect(buildHandoverDates(null)).toBeNull()
    expect(buildHandoverDates('nope')).toBeNull()
  })

  it('computes DLP (+1yr), ceiling-leak (+5yr) and spalling (+10yr) dates', () => {
    const res = buildHandoverDates('2026-07-19')
    expect(res).not.toBeNull()
    const byId = Object.fromEntries(res!.entries.map((e) => [e.id, iso(e.date)]))
    expect(byId['dlp-end']).toBe('2027-07-19')
    expect(byId['ceiling-leak']).toBe('2031-07-19')
    expect(byId['spalling']).toBe('2036-07-19')
  })
})

describe('formatHandoverDate', () => {
  it('formats a UTC date as d MMM yyyy', () => {
    expect(formatHandoverDate(new Date(Date.UTC(2027, 6, 19)))).toBe('19 Jul 2027')
  })
})
