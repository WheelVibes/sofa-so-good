/**
 * Layout critique (G8) — pure data core.
 *
 * `designScore` measures whether a room is BROKEN (overlaps, wall clips, blocked
 * doors, pinch points, coverage). It does not measure whether a layout is
 * GOOD — and measured on the default flat, three genuinely different authored
 * arrangements score identically at 83 on every category, so the G8 comparison
 * falls through to its price tie-break. A ruler that cannot tell three layouts
 * apart makes "argue the trade-offs" vacuous.
 *
 * This adds the missing dimension: the spatial-relationship checks a designer
 * actually makes. Each threshold is taken from published interior-design
 * standards rather than invented — sources in
 * `docs/research/2026-09-02-layout-critique-standards.md`:
 *
 *  - **TV viewing distance** 2.4–3.7 m (8–12 ft) from screen to primary seat.
 *  - **Conversation distance** 1.8–2.4 m (6–8 ft) between facing seats;
 *    past 3.05 m (10 ft) "conversation becomes difficult — voices must be
 *    raised, and the intimacy of connection is lost".
 *  - **Coffee-table reach** 0.36–0.46 m (14–18 in) from the sofa front.
 *  - **Sofa width** 1.75–2.20 m — the typical SG 3-seater band, an ABSOLUTE
 *    figure from Singapore sources rather than a ratio against room span. The
 *    first draft used a derived 60%-of-span ratio, which warned on essentially
 *    every SG scheme and therefore described the housing stock rather than the
 *    design; the cited band identifies an over-scaled sofa directly.
 *
 * **Deliberately a SEPARATE score, not a re-weighting of `designScore`.**
 * Re-tuning a shipped, user-visible score is a product decision (see
 * `TODO.md`); adding a new measurement beside it is not. A caller can show both
 * and let the user weigh them.
 *
 * **What it does NOT claim.** It measures geometry, not taste — nothing here
 * says a scheme is prettier. A layout can score full marks and still be dull.
 * And each check is skipped, not failed, when the design lacks the pieces it
 * needs (no TV → no viewing-distance verdict), so a sparse room is never
 * penalised for what it does not contain.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { allPlanRooms, roomAtItem } from '../floorplan/levels'
import { type FloorPlan, type PlanRoom, planRoomArea } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** Published thresholds, all metres. See the module header for sources. */
export const CRITIQUE = {
  /** Screen-to-seat comfortable band. */
  tvMin: 2.4,
  tvMax: 3.7,
  /** Facing-seat conversation band. */
  convMin: 1.8,
  convIdealMax: 2.4,
  /** Past this, conversation across the group stops working. */
  convBreakdown: 3.05,
  /**
   * Rug overhang beyond the SOFA's sides (m). "Make sure your rug extends
   * 6-10 inches off each side of your sofa" — 6" ≈ 0.15 m is the minimum.
   */
  rugSofaSideMin: 0.15,
  /**
   * Rug overhang beyond a DINING TABLE on all sides (m). Published as 24
   * inches: a dining rug "should extend at least 24 inches beyond the table on
   * all sides" so a pulled-out chair's back legs stay on the rug.
   */
  rugDiningSideMin: 0.61,
  /**
   * Rug overhang beyond a BED on its sides and FOOT (m) — the head end is
   * deliberately excluded, see `HEAD_EXCLUDED` below. Published as a band of
   * 18-24 inches; the check takes the LOWER bound, 18" = 0.46 m, so it only
   * speaks up below what every source treats as the floor rather than nagging
   * anyone inside the band. Corrected v0.31.5.314: this was 0.61 m applied to
   * all four sides, which failed every correctly-placed bedroom rug in the
   * shipped default flat.
   */
  rugBedSideMin: 0.46,
  /**
   * A BEDSIDE RUNNER is a published bedroom layout in its own right, not a
   * failed attempt at an under-bed rug: "the best layouts for small bedrooms
   * are two-thirds placement, side runners, or a rug at the foot of the bed".
   * Its own rule is length, not overhang — "ensure that the runner is at least
   * three-quarters of your total bed length" — so it is judged against the bed
   * it serves rather than against a size it was never trying to be.
   *
   * This matters for HDB bedrooms specifically: all three bedrooms in the
   * shipped default flat use runners, and the overhang rule failed every one of
   * them. A check that condemns the correct answer for a small room is worse
   * than no check.
   */
  rugRunnerBedLengthMin: 0.75,
  /** Sofa front to coffee-table edge. */
  tableMin: 0.36,
  tableMax: 0.46,
  /**
   * Typical 3-seater sofa width in Singapore homes (m). SG sources give an
   * ABSOLUTE band rather than a ratio — "three-seaters are typically 175 cm to
   * 220 cm wide", narrowing to "between 190 and 210 cm" for a 4-room HDB living
   * room. An absolute band is the honest check: a ratio against room span
   * warned on essentially every SG scheme and so described the housing stock
   * rather than the design (recorded in the standards doc).
   */
  sofaWidthMin: 1.75,
  sofaWidthMax: 2.2,
} as const

export type CritiqueId =
  | 'tv-distance'
  | 'conversation'
  | 'coffee-table'
  | 'sofa-proportion'
  | 'rug-size'

export type CritiqueVerdict = 'pass' | 'warn' | 'fail' | 'skipped'

export interface CritiqueFinding {
  id: CritiqueId
  label: string
  /** `pass` = within the published band · `warn` = outside it but usable ·
   *  `fail` = past the point the standard says it stops working ·
   *  `skipped` = the design lacks the pieces this check needs. */
  verdict: CritiqueVerdict
  /** The measured value + the band, so a user can judge the call themselves. */
  detail: string
  roomName?: string
}

export interface LayoutCritique {
  findings: CritiqueFinding[]
  /** 0–100 over the checks that actually APPLIED (skipped ones are excluded, so
   *  a sparse design is not scored against absent furniture). 100 when nothing
   *  applied — "no evidence of a problem", not "perfect". */
  score: number
  /** How many checks applied, so `score` can be read honestly. */
  applied: number
}

const SEATING_RE = /^(sofa|armchair)/
const TV_RE = /^tv/
const TABLE_RE = /^coffee-table/
/** Pieces a rug is sized against. */
/**
 * Pieces a rug is sized against, and how each is recognised.
 *
 * Beds go by CATEGORY, not by name. The first version used
 * `/^(sofa|dining-table)|bed/`, whose `bed` alternative is unanchored — so
 * `rug-bedroom` matched, every bedroom rug became its own nearest anchor, and
 * the check reported a serene 0.00 m overhang. Anchoring it (`/^bed/`) would
 * have traded that for silently skipping `toddler-bed` and
 * `ikea-malm-bed-frame-high-90x200`, both real catalogue ids. The category is
 * the property actually being asked about.
 */
const RUG_ANCHOR_NAME_RE = /^(sofa|dining-table)/
const RUG_RE = /rug/
function isRugAnchor(def: FurnitureDef, defId: string): boolean {
  if (RUG_RE.test(defId)) return false
  return def.category === 'beds' || RUG_ANCHOR_NAME_RE.test(defId)
}
/** Rug and anchor are treated as square to each other within this many degrees;
 *  beyond it the axis-aligned measurement is refused rather than guessed. */
const RUG_ALIGN_TOLERANCE_RAD = (8 * Math.PI) / 180

/** The four world-axis sides an overhang can be measured on. */
type RugDir = '-x' | '+x' | '-z' | '+z'
const RUG_DIRS: readonly RugDir[] = ['-x', '+x', '-z', '+z']

/**
 * Which world side a bed's HEAD is on, from its rotation.
 *
 * Furniture primitives are built facing +Z (see the root CLAUDE.md), and a bed
 * is built lying along that axis with the headboard at the far end, so the head
 * is toward local -Z. Rotating that by the item's yaw and snapping to the
 * nearest axis gives the world side — safe to snap because this is only reached
 * for pairs `roughlyAligned` has already certified within 8 degrees of square.
 */
function headDir(bed: FurnitureItem): RugDir {
  const rad = bed.rotation ?? 0
  // Local (0, -1) through the SAME transform `itemFootprint` applies:
  // world = (cos*lx - sin*lz, sin*lx + cos*lz), so (0, -1) maps to (sin, -cos).
  // Getting the x sign backwards here silently excludes the FOOT instead of the
  // head on a quarter-turned bed — caught by the rotated-bed test, which is the
  // only reason a direction-derived exclusion is worth more than dropping the
  // worst side.
  const x = Math.sin(rad)
  const z = -Math.cos(rad)
  if (Math.abs(x) > Math.abs(z)) return x > 0 ? '+x' : '-x'
  return z > 0 ? '+z' : '-z'
}

/** Above this share of the RUG lying under the bed, it is an under-bed rug
 *  rather than a runner. A classification boundary, not a published figure —
 *  see `CRITIQUE.rugRunnerBedLengthMin`. */
const RUNNER_MAX_UNDER_FRACTION = 0.25
/** A runner has to actually be beside the bed; past this gap it is a stray rug. */
const RUNNER_MAX_GAP_M = 0.6

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

/** Overlap area of two axis-aligned boxes. */
function overlapArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
  return w > 0 && d > 0 ? w * d : 0
}

function boxArea(b: Bounds): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxZ - b.minZ)
}

/**
 * Assesses a rug as a BEDSIDE RUNNER, or returns null when it is not one and
 * the overhang rule should apply instead.
 *
 * The runner's own published rule is length: at least three-quarters of the
 * bed's length, so you land on it getting out of bed. Overhang is not measured
 * — a runner is not trying to frame the bed, and holding it to the 0.46 m
 * side clearance condemned all three correctly-styled bedrooms in the shipped
 * default flat.
 */
function runnerVerdict(
  rug: Bounds,
  bed: Bounds,
  sideNeed: number,
): { verdict: CritiqueVerdict; detail: string } | null {
  const rugArea = boxArea(rug)
  if (rugArea <= 0) return null
  if (overlapArea(rug, bed) / rugArea > RUNNER_MAX_UNDER_FRACTION) return null

  // Gap to the bed, on whichever axis they are separated. A rug across the
  // room is not a runner, so it falls through to the overhang rule and is
  // reported as a separate island.
  const gapX = Math.max(bed.minX - rug.maxX, rug.minX - bed.maxX, 0)
  const gapZ = Math.max(bed.minZ - rug.maxZ, rug.minZ - bed.maxZ, 0)
  const gap = Math.max(gapX, gapZ)
  if (gap > RUNNER_MAX_GAP_M) return null

  // Compare the runner's LONG side against the bed's long side.
  const runnerLen = Math.max(rug.maxX - rug.minX, rug.maxZ - rug.minZ)
  const bedLen = Math.max(bed.maxX - bed.minX, bed.maxZ - bed.minZ)
  const want = bedLen * CRITIQUE.rugRunnerBedLengthMin
  if (runnerLen >= want) {
    return {
      verdict: 'pass',
      detail: `Read as a bedside runner: ${runnerLen.toFixed(2)} m long against a ${bedLen.toFixed(2)} m bed (wants ≥ ${want.toFixed(2)} m, three-quarters of the bed). Judged on length, not overhang — a runner is not framing the bed.`,
    }
  }
  return {
    verdict: 'warn',
    detail: `Read as a bedside runner, but only ${runnerLen.toFixed(2)} m long against a ${bedLen.toFixed(2)} m bed — a runner wants ≥ ${want.toFixed(2)} m (three-quarters of the bed) so you land on it getting up. Alternatively slide it under the bed's lower two-thirds and size it for ${sideNeed.toFixed(2)} m clear at the sides.`,
  }
}

/** Axis-aligned bounds of a placed item. */
function aabb(item: FurnitureItem, def: FurnitureDef) {
  const c = obbCorners(itemFootprint(item, def))
  const xs = c.map((p) => p[0])
  const zs = c.map((p) => p[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

/**
 * True when two items' yaws differ by a multiple of a quarter turn, within
 * tolerance — i.e. their bounding boxes describe them faithfully.
 *
 * `FurnitureItem.rotation` is in RADIANS (`itemFootprint` feeds it straight to
 * `Math.cos`). The first version of this took `% 90` on that field, which made
 * the gate vacuous — every plausible yaw is under 8 when read as degrees, so it
 * certified oblique pairs as square and measured their bounding boxes anyway.
 */
function roughlyAligned(a: FurnitureItem, b: FurnitureItem): boolean {
  const quarter = Math.PI / 2
  const d = Math.abs((a.rotation ?? 0) - (b.rotation ?? 0)) % quarter
  return Math.min(d, quarter - d) <= RUG_ALIGN_TOLERANCE_RAD
}

function centre(item: FurnitureItem): [number, number] {
  return [item.position[0], item.position[1]]
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/**
 * The habitable room containing an item, on the item's OWN storey.
 *
 * `rooms` is every storey's, so the bare `pointInRoom` this used matched a room
 * directly above or below the piece — putting an upstairs sofa in the ground
 * living room's critique, and (worse) letting the TV-vs-seating check pair a
 * television on one floor with a sofa on another.
 */
function roomOf(plan: FloorPlan, item: FurnitureItem): PlanRoom | undefined {
  return roomAtItem(plan, item) ?? undefined
}

/**
 * Clearance between two oriented boxes measured along the line joining their
 * centres: centre distance minus each box's SUPPORT RADIUS in that direction.
 * A box's radius along unit direction `d` is `hx*|d·ax| + hz*|d·az|` where
 * `ax`/`az` are its own rotated axes — the standard OBB projection. Using a
 * half-extent directly would be wrong for any rotated piece.
 *
 * Returns 0 when the boxes overlap along that line.
 */
function obbGapAlongCentres(
  a: { cx: number; cz: number; hx: number; hz: number; rot: number },
  b: { cx: number; cz: number; hx: number; hz: number; rot: number },
): number {
  const dx = b.cx - a.cx
  const dz = b.cz - a.cz
  const len = Math.hypot(dx, dz)
  if (!(len > 0)) return 0
  const ux = dx / len
  const uz = dz / len
  const radius = (o: typeof a): number => {
    const cos = Math.cos(o.rot)
    const sin = Math.sin(o.rot)
    // Local axes of the box in world space.
    const axDot = Math.abs(ux * cos + uz * sin)
    const azDot = Math.abs(ux * -sin + uz * cos)
    return o.hx * axDot + o.hz * azDot
  }
  return Math.max(0, len - radius(a) - radius(b))
}

/** Footprint width of an item (its longer horizontal extent). */
function itemWidth(item: FurnitureItem, def: FurnitureDef): number {
  const obb = itemFootprint(item, def)
  return Math.max(obb.hx, obb.hz) * 2
}

/**
 * Critique the layout's spatial relationships. `items` should be the whole
 * design; checks are scoped per room so a two-living-space plan is judged room
 * by room rather than across the home.
 */
export function buildLayoutCritique(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): LayoutCritique {
  const rooms = allPlanRooms(plan).filter((r) => planRoomArea(r) > 0)
  const findings: CritiqueFinding[] = []

  const resolved = items.flatMap((it) => {
    const def = defs[it.defId]
    return def?.defaultFootprint ? [{ it, def }] : []
  })
  const seating = resolved.filter((r) => SEATING_RE.test(r.it.defId))
  const tvs = resolved.filter((r) => TV_RE.test(r.it.defId))
  const tables = resolved.filter((r) => TABLE_RE.test(r.it.defId))

  // 1 — TV viewing distance, per TV, to its NEAREST seat in the same room.
  if (tvs.length === 0 || seating.length === 0) {
    findings.push({
      id: 'tv-distance',
      label: 'TV viewing distance',
      verdict: 'skipped',
      detail: 'No TV and seating pair in one room to measure.',
    })
  } else {
    for (const tv of tvs) {
      const room = roomOf(plan, tv.it)
      const inRoom = seating.filter((s) => (room ? roomOf(plan, s.it)?.id === room.id : false))
      if (inRoom.length === 0) continue
      const nearest = inRoom.reduce((best, s) =>
        dist(centre(s.it), centre(tv.it)) < dist(centre(best.it), centre(tv.it)) ? s : best,
      )
      const d = dist(centre(nearest.it), centre(tv.it))
      const verdict = d >= CRITIQUE.tvMin && d <= CRITIQUE.tvMax ? 'pass' : 'warn'
      findings.push({
        id: 'tv-distance',
        label: 'TV viewing distance',
        verdict,
        detail: `${d.toFixed(2)} m from the nearest seat (comfortable band ${CRITIQUE.tvMin}–${CRITIQUE.tvMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 2 — Conversation distance between the two seats FURTHEST apart in a room:
  //     that spread is what decides whether the group can hold one conversation.
  const byRoom = new Map<string, { it: FurnitureItem; def: FurnitureDef }[]>()
  for (const s of seating) {
    const room = roomOf(plan, s.it)
    if (!room) continue
    const list = byRoom.get(room.id) ?? []
    list.push(s)
    byRoom.set(room.id, list)
  }
  const convRooms = [...byRoom.entries()].filter(([, list]) => list.length >= 2)
  if (convRooms.length === 0) {
    findings.push({
      id: 'conversation',
      label: 'Conversation grouping',
      verdict: 'skipped',
      detail: 'Fewer than two seats in any one room.',
    })
  } else {
    for (const [roomId, list] of convRooms) {
      let widest = 0
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          widest = Math.max(widest, dist(centre(list[i]!.it), centre(list[j]!.it)))
        }
      }
      const room = rooms.find((r) => r.id === roomId)
      const verdict =
        widest > CRITIQUE.convBreakdown
          ? 'fail'
          : widest >= CRITIQUE.convMin && widest <= CRITIQUE.convIdealMax
            ? 'pass'
            : 'warn'
      findings.push({
        id: 'conversation',
        label: 'Conversation grouping',
        verdict,
        detail:
          verdict === 'fail'
            ? `Seats ${widest.toFixed(2)} m apart — past ${CRITIQUE.convBreakdown} m a group cannot hold one conversation.`
            : `Widest seat spacing ${widest.toFixed(2)} m (ideal ${CRITIQUE.convMin}–${CRITIQUE.convIdealMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 3 — Coffee-table reach from the nearest seat in the same room.
  if (tables.length === 0) {
    findings.push({
      id: 'coffee-table',
      label: 'Coffee-table reach',
      verdict: 'skipped',
      detail: 'No coffee table placed.',
    })
  } else {
    for (const t of tables) {
      const room = roomOf(plan, t.it)
      const inRoom = seating.filter((s) => (room ? roomOf(plan, s.it)?.id === room.id : false))
      if (inRoom.length === 0) continue
      const nearest = inRoom.reduce((best, s) =>
        dist(centre(s.it), centre(t.it)) < dist(centre(best.it), centre(t.it)) ? s : best,
      )
      // Clearance along the line joining the two centres. Each OBB's extent in
      // that direction is its SUPPORT RADIUS — hx*|d.ax| + hz*|d.az| — not its
      // half-depth: a rotated sofa presents a different extent toward the table
      // than its local Z, and using `hz` blindly reported ~0.87 m where the
      // real clearance was far smaller.
      const gap = obbGapAlongCentres(
        itemFootprint(nearest.it, nearest.def),
        itemFootprint(t.it, t.def),
      )
      const verdict = gap >= CRITIQUE.tableMin && gap <= CRITIQUE.tableMax ? 'pass' : 'warn'
      findings.push({
        id: 'coffee-table',
        label: 'Coffee-table reach',
        verdict,
        detail: `${gap.toFixed(2)} m from the nearest seat (reachable band ${CRITIQUE.tableMin}–${CRITIQUE.tableMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 4 — Sofa width against the typical SG band.
  const sofas = resolved.filter((r) => /^sofa/.test(r.it.defId))
  if (sofas.length === 0) {
    findings.push({
      id: 'sofa-proportion',
      label: 'Sofa size',
      verdict: 'skipped',
      detail: 'No sofa placed.',
    })
  } else {
    for (const s of sofas) {
      const room = roomOf(plan, s.it)
      const w = itemWidth(s.it, s.def)
      if (!(w > 0)) continue
      const verdict = w >= CRITIQUE.sofaWidthMin && w <= CRITIQUE.sofaWidthMax ? 'pass' : 'warn'
      findings.push({
        id: 'sofa-proportion',
        label: 'Sofa size',
        verdict,
        detail:
          w > CRITIQUE.sofaWidthMax
            ? `${w.toFixed(2)} m wide — above the ${CRITIQUE.sofaWidthMin}–${CRITIQUE.sofaWidthMax} m typical for a Singapore 3-seater, so it will eat the room.`
            : `${w.toFixed(2)} m wide (typical SG 3-seater band ${CRITIQUE.sofaWidthMin}–${CRITIQUE.sofaWidthMax} m).`,
        roomName: room?.name,
      })
    }
  }

  // 5 — Rug size against its anchor piece. The single most-cited amateur error
  // in interior design, and the app can place a rug via `autoArrange` without
  // ever checking it: `suggestions.ts` only prompts when a rug is ABSENT, which
  // is presence rather than adequacy — the same shape as the old lighting
  // prompt that a single pendant satisfied.
  //
  // Assessed on AXIS-ALIGNED bounds, and ONLY when the rug and its anchor are
  // roughly square to each other. A rotated rug's bounding box is LARGER than
  // the rug, so measuring overhang from it would overstate coverage and pass a
  // rug that is actually too small — an error in the dangerous direction. Those
  // pairs are skipped and counted rather than guessed at.
  const rugs = resolved.filter((r) => RUG_RE.test(r.it.defId))
  const anchors = resolved.filter((r) => isRugAnchor(r.def, r.it.defId))
  if (rugs.length === 0 || anchors.length === 0) {
    findings.push({
      id: 'rug-size',
      label: 'Rug size',
      verdict: 'skipped',
      detail:
        rugs.length === 0
          ? 'No rug placed.'
          : 'No sofa, bed or dining table for a rug to sit under.',
    })
  } else {
    let skewed = 0
    for (const rug of rugs) {
      const room = roomOf(plan, rug.it)
      // The anchor this rug serves: the nearest one in the SAME room.
      const inRoom = anchors.filter((a) => (room ? roomOf(plan, a.it)?.id === room.id : false))
      if (inRoom.length === 0) continue
      const anchor = inRoom.reduce((best, a) =>
        dist(centre(a.it), centre(rug.it)) < dist(centre(best.it), centre(rug.it)) ? a : best,
      )
      if (!roughlyAligned(rug.it, anchor.it)) {
        skewed += 1
        continue
      }
      const isSofa = /^sofa/.test(anchor.it.defId)
      const isBed = anchor.def.category === 'beds'
      const need = isSofa
        ? CRITIQUE.rugSofaSideMin
        : isBed
          ? CRITIQUE.rugBedSideMin
          : CRITIQUE.rugDiningSideMin
      const r = aabb(rug.it, rug.def)
      const a = aabb(anchor.it, anchor.def)
      // Overhang on each of the FOUR sides, keyed by world direction.
      const sides: Record<RugDir, number> = {
        '-x': a.minX - r.minX,
        '+x': r.maxX - a.maxX,
        '-z': a.minZ - r.minZ,
        '+z': r.maxZ - a.maxZ,
      }
      // A bedroom rug is conventionally set under the LOWER TWO-THIRDS of the
      // bed: it frames the two sides and the foot, and deliberately stops short
      // of the head so the nightstands stay level on bare floor. Measuring the
      // head side would fail every correctly-placed bedroom rug — which it did,
      // four times over, on the shipped default flat before this was fixed.
      // Excluded by DIRECTION, derived from the bed's rotation, not by dropping
      // whichever side happens to measure worst (that would excuse a genuinely
      // short side and make the check unfalsifiable).
      const measured = isBed ? RUG_DIRS.filter((d) => d !== headDir(anchor.it)) : RUG_DIRS
      // The tightest measured side: one generous side does not excuse a short one.
      const worst = Math.min(...measured.map((d) => sides[d]))
      const overlaps = r.maxX > a.minX && r.minX < a.maxX && r.maxZ > a.minZ && r.minZ < a.maxZ
      const anchorLabel = isSofa ? 'sofa' : isBed ? 'bed' : 'dining table'

      // A rug beside a bed is judged as a RUNNER, on length, not on overhang.
      // Classified by how much of the RUG lies under the bed: a two-thirds or
      // full placement buries most of it, a runner almost none. The 25 %
      // boundary is a classification heuristic of mine, NOT a published figure
      // — the sources name the three layouts but not where one becomes the
      // other. It sits well clear of both populations (the shipped runners
      // measure 0-4 %; a two-thirds placement is upwards of 60 %), so it
      // decides nothing marginal.
      if (isBed) {
        const runner = runnerVerdict(r, a, need)
        if (runner) {
          findings.push({ id: 'rug-size', label: 'Rug size', roomName: room?.name, ...runner })
          continue
        }
      }
      if (!overlaps) {
        findings.push({
          id: 'rug-size',
          label: 'Rug size',
          verdict: 'fail',
          detail: `The rug does not sit under the ${anchorLabel} at all — it reads as a separate island rather than anchoring the group.`,
          roomName: room?.name,
        })
        continue
      }
      // A NEGATIVE tightest side means the rug stops SHORT of that edge rather
      // than overhanging it by a negative amount, so it is reported as a
      // shortfall. "Only -1.00 m past the bed" is nonsense copy, and it existed
      // for exactly one tick.
      const short = worst < 0
      const verdict = worst >= need ? 'pass' : isSofa && !short ? 'warn' : 'fail'
      const sideNote = isBed ? ' sides or foot' : ' side'
      findings.push({
        id: 'rug-size',
        label: 'Rug size',
        verdict,
        detail:
          worst >= need
            ? `Extends ${worst.toFixed(2)} m past the ${anchorLabel} on its tightest${sideNote} (wants ≥ ${need.toFixed(2)} m).`
            : short
              ? `The ${anchorLabel} overhangs the rug by ${Math.abs(worst).toFixed(2)} m on one${sideNote} — the rug wants to extend ${need.toFixed(2)} m PAST it, so size up or shift the rug.`
              : isSofa
                ? `Only ${worst.toFixed(2)} m past the sofa on its tightest side — a rug wants 0.15–0.25 m clear of each side, or the front legs on at minimum.`
                : `Only ${worst.toFixed(2)} m past the ${anchorLabel} on its tightest${sideNote}; ${need.toFixed(2)} m is the published minimum so ${isBed ? 'feet land on the rug getting out of bed' : 'a pulled-out chair stays on the rug'}.`,
        roomName: room?.name,
      })
    }
    if (skewed > 0) {
      findings.push({
        id: 'rug-size',
        label: 'Rug size',
        verdict: 'skipped',
        detail: `${skewed} rug${skewed === 1 ? '' : 's'} not square to its anchor — overhang is not measured on a rotated pair, because a bounding box would overstate the rug's coverage.`,
      })
    }
  }

  const applicable = findings.filter((f) => f.verdict !== 'skipped')
  const points = applicable.reduce(
    (sum, f) => sum + (f.verdict === 'pass' ? 100 : f.verdict === 'warn' ? 55 : 0),
    0,
  )
  return {
    findings,
    score: applicable.length === 0 ? 100 : Math.round(points / applicable.length),
    applied: applicable.length,
  }
}
