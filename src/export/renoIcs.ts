/**
 * Renovation timeline → iCalendar (.ics) export.
 *
 * Turns the indicative phase schedule from `analysis/renoTimeline` into an
 * RFC-5545 VCALENDAR string so a homeowner can drop the reno phases straight
 * into Google / Apple / Outlook calendars. One all-day VEVENT per phase,
 * laid out sequentially from a caller-supplied move-in / works start date.
 *
 * Working days vs calendar days: the planner counts *working* days (the SG
 * 6-day reno week). We map each phase's `startDay`/`endDay` working-day offset
 * directly onto calendar days from `startDate` — i.e. the events are
 * contiguous calendar blocks. This keeps the calendar a simple, readable
 * sequence rather than scattering single days across weekends; the report
 * already labels the schedule as indicative.
 *
 * ## Purity
 * This module is **pure** + dependency-free (only the `Phase` type from the
 * planner). `startDate` is passed IN — we never call `new Date()` / `Date.now()`
 * here so the output is fully deterministic and unit-testable. UIDs are derived
 * from the phase id + start date (stable across re-exports), not random.
 *
 * Callers download the string as a `text/calendar` `.ics` file (see
 * `ui/openRenoIcs.ts`).
 */

import type { Phase } from '../analysis/renoTimeline'

/** PRODID advertised in the VCALENDAR header (RFC-5545 §3.7.3). */
export const ICS_PRODID = '-//Sofa So Good//Renovation Timeline//EN'

/** RFC-5545 mandates CRLF line breaks (§3.1). */
const CRLF = '\r\n'

/**
 * Escape a value for an iCalendar TEXT property (RFC-5545 §3.3.11):
 * backslash, semicolon and comma are escaped, and newlines become `\n`.
 * (Order matters — escape backslash first so we don't double-escape.)
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Coerce a `Date | number` (epoch ms) to a Date; invalid → epoch 0. */
function toDate(value: Date | number): Date {
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

/**
 * Format `base` + `offsetDays` calendar days as a DATE value `YYYYMMDD`
 * (RFC-5545 §3.3.4), computed in UTC so all-day dates never shift by a
 * timezone offset.
 */
export function icsDate(base: Date, offsetDays: number): string {
  const d = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offsetDays),
  )
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = d.getUTCDate().toString().padStart(2, '0')
  return `${y}${m}${day}`
}

/** A DTSTAMP `YYYYMMDDTHHMMSSZ` (UTC) — required on every VEVENT. */
export function icsTimestamp(at: Date): string {
  const iso = at.toISOString() // 2026-06-26T12:34:56.789Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
}

/** Build one VEVENT block (lines, no trailing CRLF) for a phase. */
function buildVevent(phase: Phase, base: Date, dtstamp: string): string[] {
  // DTEND is exclusive for VALUE=DATE events, so endDay maps straight to it.
  // Guard a zero/negative span so the event is always at least one day long.
  const start = phase.startDay
  const end = Math.max(phase.endDay, phase.startDay + 1)
  // Stable per-phase UID: phase id + the start date, so re-exporting the same
  // plan/date updates rather than duplicates the calendar events.
  const uid = `reno-${phase.id}-${icsDate(base, 0)}@sofa-so-good`
  const summary = escapeIcsText(phase.name)
  const description = escapeIcsText(phase.note ?? '')
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${icsDate(base, start)}`,
    `DTEND;VALUE=DATE:${icsDate(base, end)}`,
    `SUMMARY:${summary}`,
  ]
  if (description) lines.push(`DESCRIPTION:${description}`)
  lines.push('END:VEVENT')
  return lines
}

/**
 * Build an RFC-5545 VCALENDAR string from the timeline phases.
 *
 * @param phases    Ordered phases from `buildRenoTimeline(...).phases`.
 * @param startDate The works / move-in start date (Date or epoch ms). Passed
 *                  in for purity — never sourced from the clock here.
 * @param now       Optional DTSTAMP source (defaults to `startDate`); pass a
 *                  fixed value in tests for fully deterministic output.
 *
 * Zero phases yields a **valid empty VCALENDAR** (header + footer, no VEVENTs)
 * — a well-formed file imports cleanly as an empty calendar rather than failing.
 */
export function buildRenoIcs(
  phases: readonly Phase[],
  startDate: Date | number,
  now?: Date | number,
): string {
  const base = toDate(startDate)
  const dtstamp = icsTimestamp(toDate(now ?? startDate))
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const phase of phases) lines.push(...buildVevent(phase, base, dtstamp))
  lines.push('END:VCALENDAR')
  // CRLF between every line, including a trailing one.
  return `${lines.join(CRLF)}${CRLF}`
}
