/**
 * Design Score — an aggregate, 0–100 quality assessment of the current design,
 * in the spirit of the live "design feedback" panels in Coohom / Planner 5D.
 *
 * Pure + fully testable (no GPU, no React). It re-uses the existing pure check
 * modules — collision overlaps / wall-clips, door-swing blockers, walkway
 * pinch-points, the daylight & ventilation report — and adds two new
 * design-quality heuristics (furnishing balance + lighting coverage), folding
 * them into weighted category sub-scores and one overall grade.
 *
 * Each category reports human-readable, actionable `issues` so the panel and the
 * report can tell the user *what to fix*, not just a number.
 */
import { findWallClipsByLevel } from '../collision/levelWallClips'
import { findItemOverlaps, itemFootprint } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { isItemEmitter } from '../furniture/lightEmitters'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { findNarrowGaps } from '../layout/walkway'
import { buildDaylightReport, isExternalRoom } from './daylight'

export type ScoreCategoryId = 'clearance' | 'circulation' | 'daylight' | 'furnishing' | 'lighting'

export type IssueSeverity = 'critical' | 'warning' | 'info'

export interface ScoreIssue {
  severity: IssueSeverity
  message: string
}

export interface ScoreCategory {
  id: ScoreCategoryId
  label: string
  /** 0–100, rounded. */
  score: number
  /** Relative weight in the overall score (sums to 1 across categories). */
  weight: number
  issues: ScoreIssue[]
  /** Item ids contributing to this category's issues (for click-to-select in
   *  the panel). Empty for room-level categories (daylight/furnishing/lighting). */
  offenders: string[]
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface DesignScore {
  /** Weighted overall, 0–100 (rounded). */
  overall: number
  grade: Grade
  categories: ScoreCategory[]
  itemCount: number
  /** Habitable (interior, non-external) rooms analysed. */
  roomCount: number
}

/** Category weights — sum to 1. Clearance + furnishing dominate because they're
 *  what most directly read as "a good room" vs "a broken one". */
const WEIGHTS: Record<ScoreCategoryId, number> = {
  clearance: 0.25,
  furnishing: 0.25,
  circulation: 0.2,
  daylight: 0.15,
  lighting: 0.15,
}

/** Per-issue penalties for the clearance category. */
const CLEARANCE_PENALTY = { overlap: 16, wallClip: 12, blockedDoor: 22 }
/** Per-issue penalties for the circulation category. */
const CIRCULATION_PENALTY = { tight: 14, subIdeal: 6 }

/** Furnishing coverage = furniture footprint area / room floor area. The bands
 *  below describe a comfortably-furnished room (interior-design rule of thumb:
 *  furniture should fill roughly a third of the floor, never crowd it). */
const FURNISH = {
  /** Below this a furnished room reads as sparse. */
  sparse: 0.12,
  /** Lower edge of the "well-furnished" band (full marks start here). */
  idealLow: 0.22,
  /** Upper edge of the "well-furnished" band. */
  idealHigh: 0.45,
  /** Above this a room reads as cluttered. */
  crowded: 0.62,
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v))
}

function gradeFor(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/** Habitable rooms = interior rooms with positive area, excluding balconies /
 *  ledges / other external annexes. */
function habitableRooms(plan: FloorPlan): PlanRoom[] {
  return plan.rooms.filter((r) => !isExternalRoom(r) && planRoomArea(r) > 0)
}

/** Footprint plan-area (m²) of an item — width × depth, rotation-independent. */
function footprintArea(item: FurnitureItem, def: FurnitureDef): number {
  const obb = itemFootprint(item, def)
  return 4 * obb.hx * obb.hz
}

/** Map a furnishing coverage ratio to a 0–100 sub-score with a flat "ideal"
 *  plateau and linear ramps down to sparse / crowded extremes. */
export function furnishingCoverageScore(coverage: number): number {
  if (coverage >= FURNISH.idealLow && coverage <= FURNISH.idealHigh) return 100
  if (coverage < FURNISH.idealLow) {
    // sparse(40) → idealLow(100)
    const t = (coverage - FURNISH.sparse) / (FURNISH.idealLow - FURNISH.sparse)
    return clamp(40 + t * 60)
  }
  // idealHigh(100) → crowded(45) → 0 well beyond
  const over = coverage - FURNISH.idealHigh
  const span = FURNISH.crowded - FURNISH.idealHigh
  return clamp(100 - (over / span) * 55)
}

function clearanceCategory(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  walls: CollisionWall[],
  doors: Record<string, { open: boolean }>,
): ScoreCategory {
  const overlaps = findItemOverlaps(items, defs)
  // Per-storey wall clips (F13/ML3): `walls` is the ground set; upper-level
  // items are tested against their own storey's walls, never the ground's.
  const clips = findWallClipsByLevel(items, defs, plan, doors, walls)
  // `blockedDoorItems` walks `plan.openings`; guard a partial plan that omits it.
  const blocked = Array.isArray(plan.openings) ? blockedDoorItems(items, defs, plan) : []
  const penalty =
    overlaps.length * CLEARANCE_PENALTY.overlap +
    clips.length * CLEARANCE_PENALTY.wallClip +
    blocked.length * CLEARANCE_PENALTY.blockedDoor
  const issues: ScoreIssue[] = []
  if (overlaps.length > 0)
    issues.push({
      severity: 'critical',
      message: `${overlaps.length} overlapping ${plural(overlaps.length, 'pair')} of furniture — separate them.`,
    })
  if (clips.length > 0)
    issues.push({
      severity: 'critical',
      message: `${clips.length} ${plural(clips.length, 'item')} embedded in a wall — pull them clear.`,
    })
  if (blocked.length > 0)
    issues.push({
      severity: 'critical',
      message: `${blocked.length} ${plural(blocked.length, 'item')} blocking a doorway — clear the door path.`,
    })
  if (issues.length === 0)
    issues.push({ severity: 'info', message: 'No overlaps, wall clips, or blocked doors.' })
  const offenders = [...new Set([...overlaps.flatMap((o) => [o.a, o.b]), ...clips, ...blocked])]
  return {
    id: 'clearance',
    label: 'Clearance & fit',
    score: clamp(100 - penalty),
    weight: WEIGHTS.clearance,
    issues,
    offenders,
  }
}

function circulationCategory(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
): ScoreCategory {
  const gaps = findNarrowGaps(items, defs, plan)
  const tight = gaps.filter((g) => g.severity === 'tight').length
  const sub = gaps.filter((g) => g.severity === 'sub-ideal').length
  const penalty = tight * CIRCULATION_PENALTY.tight + sub * CIRCULATION_PENALTY.subIdeal
  const issues: ScoreIssue[] = []
  if (tight > 0)
    issues.push({
      severity: 'warning',
      message: `${tight} walkway ${plural(tight, 'pinch-point')} under 0.6 m — widen for comfortable passage.`,
    })
  if (sub > 0)
    issues.push({
      severity: 'info',
      message: `${sub} walkway ${plural(sub, 'gap')} under the ideal 0.9 m.`,
    })
  if (issues.length === 0)
    issues.push({ severity: 'info', message: 'Walkways are comfortably wide.' })
  // Item ids on either side of a pinch (skip the wall pseudo-ids in `g.b`).
  const offenders = [...new Set(gaps.flatMap((g) => (g.wall ? [g.a] : [g.a, g.b])))]
  return {
    id: 'circulation',
    label: 'Circulation',
    score: clamp(100 - penalty),
    weight: WEIGHTS.circulation,
    issues,
    offenders,
  }
}

function daylightCategory(plan: FloorPlan): ScoreCategory {
  // A partial plan without a walls array can't attribute windows to rooms.
  if (!Array.isArray(plan.walls) || !Array.isArray(plan.openings)) {
    return {
      id: 'daylight',
      label: 'Daylight & airflow',
      score: 100,
      weight: WEIGHTS.daylight,
      issues: [{ severity: 'info', message: 'No wall data to assess daylight.' }],
      offenders: [],
    }
  }
  const report = buildDaylightReport(plan)
  const total = report.rooms.length
  const issues: ScoreIssue[] = []
  let score = 100
  if (total === 0) {
    issues.push({ severity: 'info', message: 'No interior rooms to assess for daylight.' })
  } else {
    // Average of the two pass-ratios (daylight + ventilation).
    const ratio = (report.daylightPassCount + report.ventPassCount) / (total * 2)
    score = clamp(Math.round(ratio * 100))
    const failing = report.rooms.filter((r) => !r.daylightPass || !r.ventPass)
    if (failing.length > 0)
      issues.push({
        severity: 'warning',
        message: `${failing.length} ${plural(failing.length, 'room')} below the daylight/airflow rule of thumb — add or widen windows.`,
      })
    else
      issues.push({ severity: 'info', message: 'Every room meets the daylight & airflow guide.' })
  }
  return {
    id: 'daylight',
    label: 'Daylight & airflow',
    score,
    weight: WEIGHTS.daylight,
    issues,
    offenders: [],
  }
}

function furnishingCategory(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  rooms: PlanRoom[],
): ScoreCategory {
  const issues: ScoreIssue[] = []
  // Coverage per room (only floor-standing footprints count toward fill).
  const scores: number[] = []
  let furnishedRooms = 0
  for (const room of rooms) {
    const area = planRoomArea(room)
    if (area <= 0) continue
    let filled = 0
    let count = 0
    for (const it of items) {
      const def = defs[it.defId]
      if (!def || def.noClip || def.mounted) continue
      if (!pointInRoom(room, it.position[0], it.position[1])) continue
      filled += footprintArea(it, def)
      count += 1
    }
    if (count === 0) continue
    furnishedRooms += 1
    const coverage = filled / area
    const s = furnishingCoverageScore(coverage)
    scores.push(s)
    if (coverage < FURNISH.sparse)
      issues.push({
        severity: 'info',
        message: `${room.name} looks sparse — room for more pieces.`,
      })
    else if (coverage > FURNISH.crowded)
      issues.push({
        severity: 'warning',
        message: `${room.name} is crowded (${Math.round(coverage * 100)}% filled) — open it up.`,
      })
  }
  let score = 100
  if (scores.length === 0) {
    issues.push({ severity: 'info', message: 'Add furniture to a room to get balance feedback.' })
  } else {
    score = clamp(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))
    if (issues.length === 0)
      issues.push({
        severity: 'info',
        message: `${furnishedRooms} ${plural(furnishedRooms, 'room')} comfortably furnished.`,
      })
  }
  return {
    id: 'furnishing',
    label: 'Furnishing balance',
    score,
    weight: WEIGHTS.furnishing,
    issues,
    offenders: [],
  }
}

function lightingCategory(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  rooms: PlanRoom[],
): ScoreCategory {
  const issues: ScoreIssue[] = []
  if (rooms.length === 0) {
    issues.push({ severity: 'info', message: 'No interior rooms to assess for lighting.' })
    return {
      id: 'lighting',
      label: 'Lighting coverage',
      score: 100,
      weight: WEIGHTS.lighting,
      issues,
      offenders: [],
    }
  }
  // A room is "lit" if it contains at least one light-emitting fixture.
  const emitterPts = items
    .filter((it) => isItemEmitter(it.defId, it.props) && defs[it.defId])
    .map((it) => it.position)
  let litRooms = 0
  const dark: string[] = []
  for (const room of rooms) {
    const lit = emitterPts.some((p) => pointInRoom(room, p[0], p[1]))
    if (lit) litRooms += 1
    else dark.push(room.name)
  }
  const score = clamp(Math.round((litRooms / rooms.length) * 100))
  if (dark.length > 0)
    issues.push({
      severity: dark.length === rooms.length ? 'warning' : 'info',
      message: `${dark.length} ${plural(dark.length, 'room')} without a light fixture${
        dark.length <= 3 ? ` (${dark.join(', ')})` : ''
      } — add a lamp or ceiling light.`,
    })
  else issues.push({ severity: 'info', message: 'Every room has a light fixture.' })
  return {
    id: 'lighting',
    label: 'Lighting coverage',
    score,
    weight: WEIGHTS.lighting,
    issues,
    offenders: [],
  }
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}

/**
 * Build the full design score from the live design + active plan. Pure: the same
 * inputs always yield the same score, so it's unit-testable and report-safe.
 */
export function buildDesignScore(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  opts: { doors?: Record<string, { open: boolean }>; walls?: CollisionWall[] } = {},
): DesignScore {
  const rooms = habitableRooms(plan)
  // Guard a partial / hand-built plan with no `walls` array (mirrors the
  // report's wall-clip guard) so this stays safe for any caller.
  const walls =
    opts.walls ?? (Array.isArray(plan.walls) ? planCollisionWalls(plan, opts.doors ?? {}) : [])
  const categories: ScoreCategory[] = [
    clearanceCategory(items, defs, plan, walls, opts.doors ?? {}),
    furnishingCategory(items, defs, rooms),
    circulationCategory(items, defs, plan),
    daylightCategory(plan),
    lightingCategory(items, defs, rooms),
  ]
  const totalWeight = categories.reduce((a, c) => a + c.weight, 0) || 1
  const overall = Math.round(categories.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight)
  return {
    overall,
    grade: gradeFor(overall),
    categories,
    itemCount: items.length,
    roomCount: rooms.length,
  }
}

/** True when there's effectively nothing to score yet (empty default shell). */
export function isUnscoredDesign(items: FurnitureItem[], plan: FloorPlan): boolean {
  return items.length === 0 && isDefaultPlan(plan)
}
