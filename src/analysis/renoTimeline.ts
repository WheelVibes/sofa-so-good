/**
 * Renovation timeline / phase planner (feature F35).
 *
 * Singapore interior designers present a project schedule to clients up front:
 * the works proceed in a well-known sequence — protection & hacking, then the
 * "wet" trades (masonry / plumbing), electrical first-fix + false ceiling,
 * carpentry, tiling & waterproofing, painting, M&E fit-out (final fix), and
 * finally cleaning & handover. This module estimates that schedule from a few
 * coarse project parameters so the app can show an indicative Gantt-style
 * timeline.
 *
 * Pure + unit-testable. No app dependencies beyond `floorplan/types` (optional,
 * to derive area + room count from a FloorPlan).
 *
 * ## Scaling assumptions (indicative only — label as an estimate in UI)
 * - Phase durations are a single auditable table (`RENO_PHASES`): each phase has
 *   a `baseDays` (the work for a typical ~90 m² 4-room HDB flat) plus a
 *   `perSqm` increment (extra days per m² above the 90 m² baseline) so larger
 *   homes take proportionally longer. Some phases also scale with the number of
 *   rooms (`perRoom`) since each wet room / bedroom adds tiling + carpentry runs.
 * - `hacking` / `carpentry` are toggleable: a "light refresh" (no hacking, no
 *   built-in carpentry) drops those phases entirely, shortening the schedule.
 * - Working days only — we report working days; `totalWeeks` divides by a 6-day
 *   SG reno work week (contractors commonly work Saturdays).
 * - Each phase runs sequentially (its `startDay` == the previous phase's
 *   `endDay`); real projects overlap some trades, which we note in `note` rather
 *   than model, to keep the estimate conservative (a safe upper bound).
 * - The total is clamped to a sane band (`MIN_TOTAL_DAYS`..`MAX_TOTAL_DAYS`,
 *   ~3–24 weeks) so degenerate input can't produce a silly schedule.
 *
 * A typical 90 m² HDB reno lands around 6–10 weeks with these numbers.
 */

import { type FloorPlan, planTotalArea } from '../floorplan/types'

/** Baseline floor area (m²) the per-phase `baseDays` are calibrated for. */
const BASELINE_SQM = 90

/** Baseline room count the `perRoom` increment is measured above. */
const BASELINE_ROOMS = 6

/** SG reno work week — contractors commonly work 6 days, so weeks = days / 6. */
const WORK_DAYS_PER_WEEK = 6

/** Clamp band for the whole schedule (working days). ~3 to ~24 weeks. */
export const MIN_TOTAL_DAYS = 18
export const MAX_TOTAL_DAYS = 145

/** A phase's tunable duration model. Days are working days. */
export interface PhaseSpec {
  id: string
  name: string
  /** Working days for the baseline (~90 m², ~6-room) flat. */
  baseDays: number
  /** Extra days per m² above the baseline area (0 = area-independent). */
  perSqm: number
  /** Extra days per room above the baseline room count (0 = room-independent). */
  perRoom: number
  /** True if this phase only exists when hacking is in scope. */
  needsHacking?: boolean
  /** True if this phase only exists when built-in carpentry is in scope. */
  needsCarpentry?: boolean
  /** Plain-language scheduling note (e.g. overlap, dependency). */
  note: string
}

/**
 * Standard SG HDB renovation phase sequence. Ordered; durations are indicative.
 * Edit/extend this table to tune the planner — nothing else hardcodes phases.
 */
export const RENO_PHASES: readonly PhaseSpec[] = [
  {
    id: 'protection-hacking',
    name: 'Protection & hacking',
    baseDays: 4,
    perSqm: 0.04,
    perRoom: 0.5,
    needsHacking: true,
    note: 'Floor/lift protection, demolition of walls, old tiles and fittings, debris removal.',
  },
  {
    id: 'masonry-plumbing',
    name: 'Masonry & plumbing',
    baseDays: 6,
    perSqm: 0.05,
    perRoom: 0.8,
    note: 'Brickwork, wall building/plastering and concealed plumbing rough-in for wet areas.',
  },
  {
    id: 'electrical-ceiling',
    name: 'Electrical & ceiling',
    baseDays: 5,
    perSqm: 0.04,
    perRoom: 0.6,
    note: 'Electrical first-fix (wiring, points) and false-ceiling / partition framing. Overlaps masonry.',
  },
  {
    id: 'carpentry',
    name: 'Carpentry',
    baseDays: 10,
    perSqm: 0.06,
    perRoom: 1.2,
    needsCarpentry: true,
    note: 'Built-in wardrobes, kitchen + vanity cabinetry — usually the longest single trade.',
  },
  {
    id: 'tiling-waterproofing',
    name: 'Tiling & waterproofing',
    baseDays: 7,
    perSqm: 0.05,
    perRoom: 1,
    note: 'Waterproofing membrane + floor/wall tiling for bathrooms, kitchen and balcony. Includes curing.',
  },
  {
    id: 'painting',
    name: 'Painting',
    baseDays: 4,
    perSqm: 0.05,
    perRoom: 0.4,
    note: 'Wall skimming, sanding and two-coat painting throughout. Touch-ups again before handover.',
  },
  {
    id: 'fit-out',
    name: 'Plumbing/electrical fit-out',
    baseDays: 3,
    perSqm: 0.02,
    perRoom: 0.5,
    note: 'Final fix — sanitary ware, taps, light fittings, switches and appliance hook-up.',
  },
  {
    id: 'cleaning-handover',
    name: 'Cleaning & handover',
    baseDays: 2,
    perSqm: 0.01,
    perRoom: 0.1,
    note: 'Post-reno cleaning, defect inspection, snagging and key handover.',
  },
] as const

/** One scheduled phase with computed cumulative day range. */
export interface Phase {
  id: string
  name: string
  /** Working days this phase spans (>= 1). */
  days: number
  /** Working day this phase starts on (0-based, == previous phase's endDay). */
  startDay: number
  /** Working day this phase ends on (startDay + days). */
  endDay: number
  note: string
}

export interface RenoTimeline {
  phases: Phase[]
  totalDays: number
  totalWeeks: number
}

/** Coarse project parameters the planner scales by. */
export interface RenoTimelineInput {
  /** Total interior floor area (m²). Negative/NaN treated as 0. */
  totalAreaSqm?: number
  /** Number of rooms. Negative/NaN treated as 0. */
  rooms?: number
  /** Built-in carpentry (wardrobes/cabinetry) in scope? Defaults to true. */
  hasCarpentry?: boolean
  /** Hacking/demolition in scope? Defaults to true. */
  hasHacking?: boolean
}

/** Sanitise a numeric input to a finite, non-negative number. */
function clean(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/** Derive planner input from a FloorPlan (area via `planTotalArea`, room count). */
function inputFromFloorPlan(
  plan: FloorPlan,
  opts?: { hasCarpentry?: boolean; hasHacking?: boolean },
): RenoTimelineInput {
  return {
    totalAreaSqm: planTotalArea(plan),
    rooms: plan.rooms.length,
    hasCarpentry: opts?.hasCarpentry,
    hasHacking: opts?.hasHacking,
  }
}

/** Compute a phase's working days from the spec, scaled by area + room count. */
function phaseDays(spec: PhaseSpec, areaSqm: number, rooms: number): number {
  const overArea = Math.max(0, areaSqm - BASELINE_SQM)
  const overRooms = Math.max(0, rooms - BASELINE_ROOMS)
  const raw = spec.baseDays + overArea * spec.perSqm + overRooms * spec.perRoom
  // Each included phase is at least a day of work.
  return Math.max(1, Math.round(raw))
}

/**
 * Build an indicative renovation schedule. Pure — never throws; empty/zero/
 * negative input yields a minimal sequential default schedule (totalDays > 0).
 */
export function buildRenoTimeline(input: RenoTimelineInput | FloorPlan): RenoTimeline {
  // Accept a FloorPlan directly for convenience.
  const normalised: RenoTimelineInput =
    'rooms' in input && Array.isArray((input as FloorPlan).rooms)
      ? inputFromFloorPlan(input as FloorPlan)
      : (input as RenoTimelineInput)

  const areaSqm = clean(normalised.totalAreaSqm)
  const rooms = clean(normalised.rooms)
  const hasCarpentry = normalised.hasCarpentry ?? true
  const hasHacking = normalised.hasHacking ?? true

  const selected = RENO_PHASES.filter((spec) => {
    if (spec.needsHacking && !hasHacking) return false
    if (spec.needsCarpentry && !hasCarpentry) return false
    return true
  })

  // Raw per-phase durations, then a uniform scale so the total fits the clamp
  // band without distorting the relative phase proportions.
  const rawDays = selected.map((spec) => phaseDays(spec, areaSqm, rooms))
  const rawTotal = rawDays.reduce((s, d) => s + d, 0) || 1
  const clampedTotal = Math.min(MAX_TOTAL_DAYS, Math.max(MIN_TOTAL_DAYS, rawTotal))
  const scale = clampedTotal / rawTotal

  const phases: Phase[] = []
  let cursor = 0
  for (let i = 0; i < selected.length; i++) {
    const spec = selected[i]
    const days = Math.max(1, Math.round(rawDays[i] * scale))
    const startDay = cursor
    const endDay = startDay + days
    phases.push({ id: spec.id, name: spec.name, days, startDay, endDay, note: spec.note })
    cursor = endDay
  }

  const totalDays = cursor
  return {
    phases,
    totalDays,
    totalWeeks: Math.round((totalDays / WORK_DAYS_PER_WEEK) * 10) / 10,
  }
}
