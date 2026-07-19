/**
 * DLP / warranty date tracker (UX research round 4 R4-8).
 *
 * Given a key-collection / TOP date, computes the concrete deadline dates the
 * move-in checklist otherwise only names in prose: the 1-year Defects Liability
 * Period (DLP) end, and HDB's post-handover warranty windows (5-year ceiling
 * leak / seepage, 10-year structural spalling). Also carries the "report defects
 * before starting renovation" reminder.
 *
 * Pure date math (no clocks baked in — `now` is passed for countdowns) so it is
 * deterministic + unit-testable, incl. leap-year anniversaries. Consumed by the
 * handover checklist surface (`ui/HandoverPanel.tsx`), the report
 * (`ui/report.ts`) and the checklist sheet.
 *
 * Refs (rules as of 2026):
 *  - homematch.sg/renovation-guides/bto-defect-checklist-defect-liability-period
 *  - hdb.gov.sg/residential/living-in-an-hdb-flat/moving-in/rectification-work-for-new-flats
 */

/** DLP length (years). */
const DLP_YEARS = 1
/** HDB ceiling-leak / seepage goodwill-repair window (years). */
const CEILING_LEAK_YEARS = 5
/** Structural spalling-concrete warranty window (years). */
const SPALLING_YEARS = 10

/** One computed warranty / deadline date. */
interface HandoverDateEntry {
  id: string
  label: string
  /** The computed calendar date (UTC midnight). */
  date: Date
  description: string
}

export interface HandoverDates {
  /** The parsed key-collection date. */
  keyCollection: Date
  entries: HandoverDateEntry[]
}

/**
 * Parse a `yyyy-mm-dd` date string to a UTC-midnight Date, or `null` when it is
 * missing / malformed. UTC avoids local-timezone off-by-one drift.
 */
export function parseKeyDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  // Reject a rolled-over invalid date (e.g. 2026-02-30 → Mar 2).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date
}

/**
 * Add `n` whole years to a UTC date, clamping a 29 Feb anniversary to 28 Feb in a
 * non-leap target year (the standard anniversary convention). Pure.
 */
export function addYears(date: Date, n: number): Date {
  const y = date.getUTCFullYear() + n
  const mo = date.getUTCMonth()
  let d = date.getUTCDate()
  // 29 Feb → 28 Feb when the target year is not a leap year.
  if (mo === 1 && d === 29 && !isLeapYear(y)) d = 28
  return new Date(Date.UTC(y, mo, d))
}

/** Gregorian leap-year test. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Whole days from `now` to `target` (positive = future, negative = past),
 *  counting by UTC-midnight day boundaries. */
export function daysUntil(target: Date, now: Date): number {
  const MS = 24 * 60 * 60 * 1000
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  const n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((t - n) / MS)
}

/** Format a computed date as e.g. "12 Jul 2027" (locale-stable, UTC). */
export function formatHandoverDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Build the warranty / deadline dates from a key-collection date string, or
 * `null` when the input is missing / malformed. Deterministic + pure.
 */
export function buildHandoverDates(iso: string | null | undefined): HandoverDates | null {
  const keyCollection = parseKeyDate(iso)
  if (!keyCollection) return null
  return {
    keyCollection,
    entries: [
      {
        id: 'dlp-end',
        label: 'Defects Liability Period ends',
        date: addYears(keyCollection, DLP_YEARS),
        description:
          'Report all defects to HDB / the developer BEFORE this date — and before starting renovation, so a fixed defect isn’t mistaken for reno damage.',
      },
      {
        id: 'ceiling-leak',
        label: 'Ceiling leak / seepage window ends',
        date: addYears(keyCollection, CEILING_LEAK_YEARS),
        description:
          'HDB’s Goodwill Repair Assistance for inter-floor ceiling leaks covers the first 5 years after completion.',
      },
      {
        id: 'spalling',
        label: 'Spalling-concrete window ends',
        date: addYears(keyCollection, SPALLING_YEARS),
        description:
          'Structural spalling-concrete rectification support runs for 10 years after completion.',
      },
    ],
  }
}
