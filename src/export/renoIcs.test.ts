import { describe, expect, it } from 'vitest'
import type { Phase } from '../analysis/renoTimeline'
import { buildRenoTimeline } from '../analysis/renoTimeline'
import { buildRenoIcs, escapeIcsText, ICS_PRODID, icsDate, icsTimestamp } from './renoIcs'

/** A fixed start date keeps every assertion deterministic (UTC). */
const START = new Date(Date.UTC(2026, 0, 5)) // 2026-01-05 (Mon)
const NOW = new Date(Date.UTC(2026, 0, 1, 9, 30, 0))

function phase(over: Partial<Phase> & Pick<Phase, 'id' | 'startDay' | 'days'>): Phase {
  const startDay = over.startDay
  const days = over.days
  return {
    id: over.id,
    name: over.name ?? over.id,
    days,
    startDay,
    endDay: over.endDay ?? startDay + days,
    note: over.note ?? '',
  }
}

/** Split a VCALENDAR string into raw CRLF-delimited lines. */
function lines(ics: string): string[] {
  expect(ics.includes('\r\n')).toBe(true)
  return ics.split('\r\n')
}

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newlines (RFC-5545 §3.3.11)', () => {
    expect(escapeIcsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d')
    expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2')
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb')
  })

  it('escapes a backslash before the special chars (no double-escape)', () => {
    // A literal backslash followed by a comma → escaped backslash + escaped comma.
    expect(escapeIcsText('\\,')).toBe('\\\\\\,')
  })
})

describe('icsDate / icsTimestamp', () => {
  it('formats a DATE value as YYYYMMDD with a calendar-day offset', () => {
    expect(icsDate(START, 0)).toBe('20260105')
    expect(icsDate(START, 3)).toBe('20260108')
    // Crosses a month boundary.
    expect(icsDate(START, 27)).toBe('20260201')
  })

  it('formats a UTC DTSTAMP as YYYYMMDDTHHMMSSZ', () => {
    expect(icsTimestamp(NOW)).toBe('20260101T093000Z')
  })
})

describe('buildRenoIcs', () => {
  const phases: Phase[] = [
    phase({
      id: 'hacking',
      name: 'Protection & hacking',
      startDay: 0,
      days: 4,
      note: 'Demo, debris.',
    }),
    phase({ id: 'carpentry', name: 'Carpentry', startDay: 4, days: 10 }),
  ]

  it('wraps events in a single VCALENDAR with a PRODID + VERSION', () => {
    const l = lines(buildRenoIcs(phases, START, NOW))
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(l).toContain('VERSION:2.0')
    expect(l).toContain(`PRODID:${ICS_PRODID}`)
    // Trailing CRLF means the last array element is an empty string.
    expect(l[l.length - 1]).toBe('')
    expect(l[l.length - 2]).toBe('END:VCALENDAR')
  })

  it('emits exactly one VEVENT per phase', () => {
    const ics = buildRenoIcs(phases, START, NOW)
    const begins = ics.match(/BEGIN:VEVENT/g) ?? []
    const ends = ics.match(/END:VEVENT/g) ?? []
    expect(begins).toHaveLength(phases.length)
    expect(ends).toHaveLength(phases.length)
  })

  it('maps startDay/days offsets onto DATE values (DTEND exclusive)', () => {
    const l = lines(buildRenoIcs(phases, START, NOW))
    // Phase 1: day 0..4 → 2026-01-05 .. 2026-01-09
    expect(l).toContain('DTSTART;VALUE=DATE:20260105')
    expect(l).toContain('DTEND;VALUE=DATE:20260109')
    // Phase 2: day 4..14 → 2026-01-09 .. 2026-01-19
    expect(l).toContain('DTSTART;VALUE=DATE:20260109')
    expect(l).toContain('DTEND;VALUE=DATE:20260119')
  })

  it('puts a DTSTAMP on every VEVENT', () => {
    const stamps = (buildRenoIcs(phases, START, NOW).match(/DTSTAMP:20260101T093000Z/g) ?? [])
      .length
    expect(stamps).toBe(phases.length)
  })

  it('gives each phase a stable, distinct UID', () => {
    const ics = buildRenoIcs(phases, START, NOW)
    expect(ics).toContain('UID:reno-hacking-20260105@sofa-so-good')
    expect(ics).toContain('UID:reno-carpentry-20260105@sofa-so-good')
    // Re-export is byte-identical (stable UID + deterministic dtstamp).
    expect(buildRenoIcs(phases, START, NOW)).toBe(ics)
  })

  it('escapes special characters in phase names + notes', () => {
    const ics = buildRenoIcs(
      [phase({ id: 'p', name: 'Tiling; waterproof, cure', startDay: 0, days: 2, note: 'a\nb' })],
      START,
      NOW,
    )
    expect(ics).toContain('SUMMARY:Tiling\\; waterproof\\, cure')
    expect(ics).toContain('DESCRIPTION:a\\nb')
  })

  it('omits DESCRIPTION when the note is empty', () => {
    const ics = buildRenoIcs([phase({ id: 'p', name: 'P', startDay: 0, days: 1 })], START, NOW)
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('handles a single phase', () => {
    const ics = buildRenoIcs(
      [phase({ id: 'only', name: 'Only', startDay: 0, days: 3 })],
      START,
      NOW,
    )
    expect(ics.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(1)
  })

  it('handles a multi-week phase (no clamping of the span)', () => {
    const l = lines(
      buildRenoIcs([phase({ id: 'long', name: 'Long', startDay: 0, days: 21 })], START, NOW),
    )
    expect(l).toContain('DTSTART;VALUE=DATE:20260105')
    expect(l).toContain('DTEND;VALUE=DATE:20260126') // +21 days
  })

  it('forces at least a one-day span for a zero-length phase', () => {
    const l = lines(
      buildRenoIcs([phase({ id: 'z', name: 'Z', startDay: 2, days: 0, endDay: 2 })], START, NOW),
    )
    expect(l).toContain('DTSTART;VALUE=DATE:20260107')
    expect(l).toContain('DTEND;VALUE=DATE:20260108')
  })

  it('zero phases → a valid empty VCALENDAR (no VEVENTs)', () => {
    const ics = buildRenoIcs([], START, NOW)
    const l = lines(ics)
    expect(l[0]).toBe('BEGIN:VCALENDAR')
    expect(l).toContain('END:VCALENDAR')
    expect(ics).not.toContain('VEVENT')
  })

  it('accepts an epoch-ms start date', () => {
    const ics = buildRenoIcs(phases, START.getTime(), NOW.getTime())
    expect(ics).toContain('DTSTART;VALUE=DATE:20260105')
  })

  it('defaults DTSTAMP to the start date when `now` is omitted', () => {
    const ics = buildRenoIcs([phase({ id: 'p', name: 'P', startDay: 0, days: 1 })], START)
    expect(ics).toContain('DTSTAMP:20260105T000000Z')
  })

  it('integrates with the real renoTimeline planner output', () => {
    const { phases: real } = buildRenoTimeline({ totalAreaSqm: 90, rooms: 6 })
    const ics = buildRenoIcs(real, START, NOW)
    expect(ics.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(real.length)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
})
