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
import { allPlanRooms, levelOfRoom } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { isItemEmitter } from '../furniture/lightEmitters'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { blockedDoorItems } from '../layout/clearance'
import { CLEARANCE } from '../layout/designRules'
import { findNarrowGaps } from '../layout/walkway'

import { buildDaylightReport, isDaylightExempt, isExternalRoom } from './daylight'

type ScoreCategoryId = 'clearance' | 'circulation' | 'daylight' | 'furnishing' | 'lighting'

export type IssueSeverity = 'critical' | 'warning' | 'info'

interface ScoreIssue {
  severity: IssueSeverity
  message: string
}

interface ScoreCategory {
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
/**
 * Circulation scoring bands. `findNarrowGaps` is deliberately an INCLUSIVE
 * advisory finder — it flags every snug adjacency (a nightstand by a bed, a
 * plant by a wall, a coffee table at arm's reach from the sofa) so the Checks
 * overlay can hint them (see `layout/walkway.ts` + `layoutPresets.test.ts`). A
 * real compact SG flat is FULL of these by design, so scoring every advisory
 * hint as a heavy penalty hard-zeroed the app's own well-furnished starter
 * layouts (UXW-P2-3). Circulation now distinguishes a genuinely IMPASSABLE
 * pinch — a tight route between two real obstacles you must walk around — from
 * those advisory adjacencies: only the former can fail the category; the latter
 * erode it gently under a cap.
 */
/**
 * **Recalibrated v0.31.8.3 — both terms used to saturate.** Measured over a
 * 62-layout corpus (19 templates x 3 arranger seeds, plus 4 presets on the
 * default plan and the authored default flat):
 *
 *  - **53 of 62 layouts hit `advisoryCap`**, and for every one of those the
 *    category score was EXACTLY `58 - 20 x impassable`. A 100-point score with
 *    five inputs had collapsed to a 4-valued function of one integer; the
 *    old formula reproduced all 62 rows with zero mismatches.
 *  - **Every single "impassable" gap in the corpus was 0.400-0.500 m** (n=60,
 *    modal 0.465-0.475). Nothing was remotely blocked, yet each cost a flat 20
 *    points, so three near-misses zeroed the category.
 *
 * The fix is graded penalties, and the anchors come from ANTHROPOMETRY rather
 * than from the corpus — calibrating the curve to the arranger's own habits
 * would just encode its quirks as the definition of good. The corpus is used
 * only to verify the spread improved: 13 distinct scores -> 44, eight
 * floor-clamped layouts -> zero, median 58 -> 59 (deliberately unchanged, so
 * this adds resolution without inflating anyone's score).
 */
const CIRCULATION = {
  /** Below this (m) you must turn SIDEWAYS to pass between two obstacles. Not
   *  "impassable" — the old field name claimed that and was wrong. ADA's 915 mm
   *  route width is the figure for two adults passing *without* turning
   *  sideways, and ~762 mm (30") is where a residential path starts to feel
   *  cramped; 0.5 m is well below both, but a person still gets through. */
  squeezeGap: 0.5,
  /** Floor of the graded band — and it is set by the INSTRUMENT, not by human
   *  dimensions, which is worth being explicit about.
   *
   *  `findNarrowGaps` skips any item-item gap `<= CLEARANCE.sofaToCoffee`
   *  (0.40 m) as "intentional close spacing", so a tighter gap is never
   *  reported at all and no penalty here could ever charge for one. An earlier
   *  cut of this recalibration anchored the band at 0.30 m on anthropometric
   *  grounds (adult chest depth is 200-250 mm) and was WRONG in a way tests
   *  written against it would not have caught: the band was unreachable, and
   *  its "blocked route" message could never fire.
   *
   *  It also means the corpus finding "every impassable gap measured
   *  0.400-0.500 m" describes the FINDER's range, not the layouts' quality.
   *  Anything genuinely blocked is invisible to this category — see the
   *  `TODO.md` entry, which is a real defect and NOT fixed here. */
  gradedFloor: 0.4,
  /** Footprint area (m²) for a piece to count as a circulation OBSTACLE — matches
   *  `layoutPresets.test`'s "large piece" bar. Below it (lamps, plants, stools,
   *  a monitor) you step around; it never defines a walkway. */
  obstacleArea: 0.5,
  /** Penalty for the tightest reportable route pinch. Charged in full at
   *  `gradedFloor` and tapering linearly to zero at `squeezeGap`, so a 0.49 m
   *  near-miss costs ~2 points where it used to cost the same 20 as a 0.41 m
   *  one. That flat charge is what let three near-misses zero the category. */
  severe: 20,
  /** Cap on the summed blocked-route penalty, so pinches alone cannot zero the
   *  category — a flat can be tight everywhere and still be a home. */
  severeCap: 45,
  /** Points per unit of SHORTFALL below the 0.9 m ideal, summed over advisory
   *  gaps. Weighting by shortfall rather than counting gaps flat is what stops
   *  the cap binding: a 0.88 m gap now costs ~0.07 points where it used to cost
   *  the same 3 as a 0.41 m one. */
  advisoryPerGap: 3,
  /** Cap on the summed advisory penalty — snug adjacencies dent the score but,
   *  unlike a blocked route, never zero a livable dense flat. Raised 42 -> 55
   *  because the shortfall weighting lowered the typical total; measured on the
   *  corpus it now binds for only the worst handful instead of 53 of 62. */
  advisoryCap: 55,
}

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

/** Clamp to 0..1 — for the graded circulation penalties. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
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
  // Every storey's rooms (F13/ML5) — allPlanRooms === plan.rooms when single-level.
  return allPlanRooms(plan).filter((r) => !isExternalRoom(r) && planRoomArea(r) > 0)
}

/** Level-aware item-in-room test: same storey AND footprint centre inside.
 *  `levelOf` maps a room id to its level id ('ground' for single-level plans). */
function itemInRoomOnLevel(
  room: PlanRoom,
  levelOf: (roomId: string) => string,
  item: { position: readonly [number, number]; levelId?: string },
): boolean {
  if ((item.levelId ?? 'ground') !== levelOf(room.id)) return false
  return pointInRoom(room, item.position[0], item.position[1])
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
  const areaById = new Map<string, number>()
  for (const it of items) {
    const def = defs[it.defId]
    if (def) areaById.set(it.id, def.defaultFootprint.w * def.defaultFootprint.d)
  }
  const isObstacle = (id: string) => (areaById.get(id) ?? 0) >= CIRCULATION.obstacleArea
  // A route pinch: a tight item↔item gap under `squeezeGap` between two real
  // obstacles you must walk AROUND — not a snug adjacency. Everything else the
  // finder reports is an advisory hint.
  const pinches = gaps.filter(
    (g) =>
      !g.wall &&
      g.severity === 'tight' &&
      g.gap < CIRCULATION.squeezeGap &&
      isObstacle(g.a) &&
      isObstacle(g.b),
  )
  // Graded by DEPTH below the squeeze bar, not counted flat: full `severe` at
  // `gradedFloor` (the tightest gap the finder reports at all) tapering to zero
  // at `squeezeGap` (where a person must turn sideways but still gets through).
  // Counting flat is what let three 0.47 m near-misses zero the category.
  const pinchPenalty = (gap: number) =>
    CIRCULATION.severe *
    clamp01((CIRCULATION.squeezeGap - gap) / (CIRCULATION.squeezeGap - CIRCULATION.gradedFloor))
  const tight = gaps.filter((g) => g.severity === 'tight').length
  const sub = gaps.filter((g) => g.severity === 'sub-ideal').length
  const advisoryGaps = gaps.filter((g) => !pinches.includes(g))
  // Advisory gaps charged by SHORTFALL below the 0.9 m ideal, so a nearly-ideal
  // gap is nearly free. A flat count made every furnished flat hit the cap.
  const advisoryShortfall = advisoryGaps.reduce(
    (a, g) => a + clamp01((CLEARANCE.walkwayIdeal - g.gap) / CLEARANCE.walkwayIdeal),
    0,
  )
  const penalty =
    Math.min(
      CIRCULATION.severeCap,
      pinches.reduce((a, g) => a + pinchPenalty(g.gap), 0),
    ) + Math.min(CIRCULATION.advisoryCap, advisoryShortfall * CIRCULATION.advisoryPerGap)
  const issues: ScoreIssue[] = []
  if (pinches.length > 0)
    issues.push({
      severity: 'warning',
      message: `${pinches.length} ${plural(pinches.length, 'pinch-point')} under ${Math.round(CIRCULATION.squeezeGap * 100)} cm between large pieces — passable only sideways. Widen the route.`,
    })
  if (tight > 0)
    issues.push({
      severity: 'info',
      message: `${tight} snug ${plural(tight, 'gap')} under 0.6 m (advisory).`,
    })
  if (sub > 0)
    issues.push({
      severity: 'info',
      message: `${sub} ${plural(sub, 'gap')} under the ideal 0.9 m (advisory).`,
    })
  if (issues.length === 0)
    issues.push({ severity: 'info', message: 'Walkways are comfortably wide.' })
  // Item ids on either side of a pinch (skip the wall pseudo-ids in `g.b`).
  const offenders = [...new Set(gaps.flatMap((g) => (g.wall ? [g.a] : [g.a, g.b])))]
  return {
    id: 'circulation',
    label: 'Circulation',
    // Rounded: the graded penalties are fractional, unlike the old integer
    // count x weight, and a category score is rendered directly.
    score: clamp(Math.round(100 - penalty)),
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
    // A room with no façade wall (`noFacade` — the HDB household shelter is the
    // canonical case) can never pass and can never be remedied: there is no
    // external wall to put a window in. Both the SCORE and the ADVICE therefore
    // exclude it — charging a flat for a windowless blast shelter scores the user
    // on something they cannot change, and "add or widen windows" is advice that
    // cannot be followed there.
    // `isDaylightExempt` is the shared predicate — the panel and the printed
    // report use the same one, so the three cannot disagree about which rooms
    // are being counted. An interior room in a HABITABLE category is NOT exempt:
    // it keeps counting against the score, and gets its own stronger finding.
    const assessable = report.rooms.filter((r) => !isDaylightExempt(r))
    // The two exemption reasons get their own notes — a shelter on the façade
    // genuinely has an external wall, so lumping it in with the interior rooms
    // would state something false about the plan.
    const shelters = report.rooms.filter((r) => r.blastShelter)
    const sealed = report.rooms.filter((r) => isDaylightExempt(r) && !r.blastShelter)
    const sealedHabitable = report.rooms.filter((r) => r.noFacade && r.habitable)
    if (assessable.length === 0) {
      issues.push({
        severity: 'info',
        message: 'No room with an alterable wall to assess for daylight.',
      })
    } else {
      // Average of the two pass-ratios (daylight + ventilation).
      const passes =
        assessable.filter((r) => r.daylightPass).length +
        assessable.filter((r) => r.ventPass).length
      score = clamp(Math.round((passes / (assessable.length * 2)) * 100))
      // Counting against the score and being told to add a window are different
      // things. An interior habitable room stays in `assessable` (it keeps
      // costing the plan points — a bedroom with no daylight is a real defect)
      // but is kept OUT of this advisory, because it has no façade to open onto
      // and gets its own stronger message below. Without this split,
      // `tpl-condo-penthouse`'s interior `Lounge` was both told to "add or widen
      // windows" and told no window was possible.
      const failing = assessable.filter((r) => (!r.daylightPass || !r.ventPass) && !r.noFacade)
      if (failing.length > 0)
        issues.push({
          severity: 'warning',
          message: `${failing.length} ${plural(failing.length, 'room')} below the daylight/airflow rule of thumb — add or widen windows.`,
        })
      else if (assessable.every((r) => r.daylightPass && r.ventPass))
        issues.push({
          severity: 'info',
          message: `Every ${sealed.length > 0 ? 'assessed ' : ''}room meets the daylight & airflow guide.`,
        })
    }
    if (sealedHabitable.length > 0)
      issues.push({
        severity: 'warning',
        message: `${sealedHabitable.map((r) => r.roomName).join(', ')} ${sealedHabitable.length === 1 ? 'is a habitable room' : 'are habitable rooms'} with no external wall — no daylight is possible at all; the layout needs an opening onto the façade.`,
      })
    if (sealed.length > 0)
      issues.push({
        severity: 'info',
        message: `${sealed.map((r) => r.roomName).join(', ')} ${sealed.length === 1 ? 'is an interior room' : 'are interior rooms'} with no external wall — no window is possible, so not assessed.`,
      })
    if (shelters.length > 0)
      issues.push({
        severity: 'info',
        message: `${shelters.map((r) => r.roomName).join(', ')} ${shelters.length === 1 ? 'is a household shelter' : 'are household shelters'} — reinforced-concrete walls that may not be opened, windowless by design, so not assessed.`,
      })
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
  levelOf: (roomId: string) => string = () => 'ground',
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
      if (!itemInRoomOnLevel(room, levelOf, it)) continue
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
  levelOf: (roomId: string) => string = () => 'ground',
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
  const emitters = items.filter((it) => isItemEmitter(it.defId, it.props) && defs[it.defId])
  let litRooms = 0
  const dark: string[] = []
  for (const room of rooms) {
    const lit = emitters.some((e) => itemInRoomOnLevel(room, levelOf, e))
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
  const levelOf = (roomId: string) => levelOfRoom(plan, roomId)?.id ?? 'ground'
  // Guard a partial / hand-built plan with no `walls` array (mirrors the
  // report's wall-clip guard) so this stays safe for any caller.
  const walls =
    opts.walls ?? (Array.isArray(plan.walls) ? planCollisionWalls(plan, opts.doors ?? {}) : [])
  const categories: ScoreCategory[] = [
    clearanceCategory(items, defs, plan, walls, opts.doors ?? {}),
    furnishingCategory(items, defs, rooms, levelOf),
    circulationCategory(items, defs, plan),
    daylightCategory(plan),
    lightingCategory(items, defs, rooms, levelOf),
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
