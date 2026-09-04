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
import { allPlanRooms, allPlanWalls, roomAtItem } from '../floorplan/levels'
import { type FloorPlan, type PlanRoom, type PlanWall, planRoomArea } from '../floorplan/types'
import { OPENABLE_CABINET_PRIMITIVES } from '../furniture/cabinetOpen'
import { resolveFootprintDims } from '../furniture/footprintDims'
import { isInteractableScreen } from '../furniture/screenInteract'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { roleOf } from '../layout/arrangeRoles'
import { CLEARANCE } from '../layout/designRules'
import { findFurnitureSeveredRooms, type SeveredRoom } from '../layout/reachability'

/**
 * Footprint area (m²) at which a piece DEFINES a walkway rather than being
 * something you step past. Mirrors `analysis/designScore.ts`'s
 * `CIRCULATION.obstacleArea`, whose docstring is the rationale: below it —
 * "lamps, plants, stools, a monitor" — "you step around; it never defines a
 * walkway". Duplicated as a literal rather than imported to keep this module
 * free of a dependency on the score that consumes it.
 */
const WALKWAY_OBSTACLE_AREA = 0.5

/** Published thresholds, all metres. See the module header for sources. */
export const CRITIQUE = {
  /** Screen-to-seat comfortable band. */
  /**
   * TV viewing distance as a multiple of the screen's DIAGONAL — the modern
   * standard, and size-dependent (corrected v0.31.8.19).
   *
   * This was a flat 2.4-3.7 m band from "position seating around 8 to 12 feet
   * from the television", which ignores screen size entirely even though the app
   * knows every screen's width. The industry figures are angular, expressed as
   * diagonal multipliers: "immersive (THX-style, ~40 degrees): sit about 1.2
   * times the screen diagonal away; balanced: about 1.4 times; relaxed
   * (SMPTE-style, ~30 degrees): about 1.6 times". For 4K "you can sit at roughly
   * 1.2 times the screen diagonal ... without seeing pixels".
   *
   * Cross-checked against the published per-size figures: a 55" 4K "sits best at
   * 5.5 feet (THX) or 7.3 feet (SMPTE)" = 1.68-2.23 m, and 1.2-1.6x a 55"
   * diagonal (1.397 m) gives 1.68-2.24 m. A 65" is quoted at 8.1 ft THX / 9.4 ft
   * SMPTE = 2.47-2.87 m against 1.98-2.64 m computed — the multipliers land a
   * little tighter than that source's THX figure, so the band is if anything
   * generous at the near end rather than falsely strict.
   *
   * The old flat band happened to suit the shipped 75" TV (2.29-3.05 m computed)
   * and would have warned a user with a 55" TV sitting at an ideal 2.0 m.
   */
  tvDiagonalMin: 1.2,
  tvDiagonalMax: 1.6,
  /** Facing-seat conversation band — the IDEAL, quoted in the detail. */
  convMin: 1.8,
  convIdealMax: 2.4,
  /**
   * Lower bound for a WARNING (m) — Hall's social-space floor, not the ideal.
   *
   * Edward T. Hall's proxemics puts "social space for casual and professional
   * relationships" at **4 to 10 feet**, with personal space at 2-4 feet. So
   * 1.22 m is where facing seats stop being social and become intimate, and
   * 3.05 m (= 10 ft, `convBreakdown`) is where social space ends — the two
   * bounds come from the same source.
   *
   * **Corrected v0.31.8.20.** The warning used to fire below the 6 ft IDEAL
   * (`convMin`), which meant warning at distances Hall calls normal social
   * distance. Measured across the shipped templates: of six "too close"
   * warnings, four were at 1.33 / 1.37 / 1.63 / 1.79 m — all inside Hall's
   * social range — and they were all in a studio, a 1-bed, a condo studio or a
   * terrace, i.e. small homes where that spacing IS the right answer. Only
   * 1.08 m and 1.16 m sat in personal space and are genuine findings.
   *
   * That is the same failure this file's own history records for the first sofa
   * check: a bar that "described the housing stock rather than the design". The
   * ideal is still reported; it just no longer produces a warning on a correctly
   * furnished small SG living room.
   */
  convSocialMin: 1.2,
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
   * anyone inside the band. Corrected v0.31.5.415: this was 0.61 m applied to
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
  /**
   * Clear floor a STORAGE piece needs in front of it to open and pass (m).
   *
   * Not a new number — it is `layout/designRules.ts`'s `CLEARANCE.storageFront`,
   * re-exported here as the critique's own threshold so the two cannot drift.
   * `designRules.ts`'s header calls those constants "the single source of truth
   * for furniture spacing" and `docs/interior-design-guidelines.md` tabulates
   * this one as a rule the app follows — but until v0.31.8.8 it had **no
   * consumer anywhere in the codebase**. A documented rule nothing implements is
   * indistinguishable from no rule.
   *
   * It is REPORTED rather than enforced, deliberately. Making the auto-arranger
   * honour it was tried in v0.31.8.7 and measured worse (see that entry and the
   * `TODO.md` note): a local per-item clearance objective cannot fix pairwise
   * spacing in a greedy sequential placer. Telling the user their wardrobe has
   * 0.45 m to open into is useful even when the app cannot fix it for them.
   */
  storageFront: CLEARANCE.storageFront,
  /**
   * Walking access alongside a bed (m) — `layout/designRules.ts`'s
   * `CLEARANCE.bedSurround`, re-exported so the two cannot drift.
   *
   * Published as **24 inches ≈ 0.61 m**: "the minimum recommended walking
   * clearance alongside a bed is 24 inches (about 61 cm)", with 30-36" the
   * comfortable figure. The constant's 0.6 m is that minimum, so the check
   * speaks up only below what the sources treat as the floor.
   *
   * Like `bedSurround` itself this is about ONE side: "for walking space on any
   * side you use to get in and out, aim for 18 to 24 inches". A single bed
   * pushed into a corner with three sides against walls is a normal small-room
   * answer, not a defect — the same reason the rug check judges a bedside runner
   * on length rather than condemning it for not framing the bed.
   *
   * **The FOOT is deliberately not part of the verdict, and that is measured.**
   * Sources do give 24" at the foot too, and `docs/interior-design-guidelines.md`
   * described the intended rule as "≥1 long side + foot". Across the 47 beds in
   * the authored flat and all 19 templates: 66% meet 0.6 m on a side, 45% at the
   * foot, and only **23% meet both** — and the curated default flat's own Main
   * Bedroom measures **0.00 m at the foot**. Requiring it would fail the app's
   * own hand-authored master bedroom, which is the clearest possible signal that
   * a foot-to-wall bed is a normal HDB answer rather than a defect.
   */
  bedSurround: CLEARANCE.bedSurround,
} as const

type CritiqueId =
  | 'bed-access'
  | 'tv-distance'
  | 'conversation'
  | 'coffee-table'
  | 'sofa-proportion'
  | 'rug-size'
  | 'storage-access'
  | 'route-access'

type CritiqueVerdict = 'pass' | 'warn' | 'fail' | 'skipped'

interface CritiqueFinding {
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

/**
 * Lounge seating, for the TV-distance and conversation checks.
 *
 * **Was `SEATING_RE = /^(sofa|armchair)/` (corrected v0.31.8.20).** That caught 5
 * defs and MISSED 5 genuine lounge seats — `recliner`, `chaise-lounge`,
 * `banquette`, `bay-daybed`, `ottoman` — because their ids do not begin "sofa"
 * or "armchair". Measured consequence: a living room furnished with a recliner
 * and a TV and no sofa reported "No TV and seating pair in one room to measure",
 * i.e. the check SKIPPED an ordinary lounge. A silent skip is worse than a wrong
 * number, because nothing prompts the reader to look.
 *
 * Selection now uses the authored arrange ROLE (`layout/arrangeRoles.ts`), which
 * puts exactly those 9 lounge pieces under `seating` and `armchair` while
 * keeping `dining-chair`, `bar-stool`, `office-chair` and `bench` out — the cut
 * these checks want, already made by someone who was thinking about it. Third
 * name-regex-as-taxonomy fixed in this module after the rug anchor and the TV
 * selector.
 *
 * **`ottoman` is then excluded, and that is measured rather than assumed.** It is
 * a footstool that sits BETWEEN the sofa and the TV, so counting it as the
 * "nearest seat" understates the viewing distance: on a fixture with a sofa at a
 * correct 2.60 m (pass for a 75" screen) and an ottoman at 1.60 m, including it
 * flips the room to a warn. Same reasoning for the conversation spread, where an
 * extra point can only widen the furthest pair and so only add warnings.
 */
const LOUNGE_ROLES: ReadonlySet<string> = new Set(['seating', 'armchair'])
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
  // Local (0, -1) under the RENDER rotation, which is what decides where the
  // headboard physically points: three.js turns local +Z to world
  // `(sin, cos)` (the convention `layout/faceWall.ts` documents), so local -Z
  // goes to `(-sin, -cos)`.
  //
  // **Corrected v0.31.8.9 — this returned the FOOT for any bed rotated ±90°.**
  // The previous version used `(sin, -cos)`, justified as "the SAME transform
  // `itemFootprint` applies". That transform is real but it is the wrong
  // authority twice over: it rotates a GLB's off-origin OFFSET (`ox`/`oz`),
  // which is 0 for every parametric bed so it never even runs, and its sense is
  // opposite to the render's. Ground truth is the app's own bed placer:
  // `placeFlush(edge:'W')` puts a bed against the WEST wall at
  // `inward('W') = π/2`, so at rotation π/2 the head points WEST — `(-1, 0)`,
  // which is what this returns and the old version did not.
  //
  // The rotated-bed tests encoded the same wrong convention, so they passed on
  // the bug: a test that shares the product's error cannot detect it, and this
  // time the shared error was a CONVENTION rather than a unit. Their
  // expectations are now derived from `inward()` instead of from the formula
  // they are checking.
  const x = -Math.sin(rad)
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
/**
 * Clear distance (m) straight out from a piece's FRONT face until something
 * blocks it — another floor item, or a wall — or `max` if nothing does.
 *
 * Furniture faces local **+Z**, and a three.js Y-rotation θ turns that front to
 * world `(sin θ, cos θ)` (`layout/faceWall.ts` derives it; cross-checked against
 * two shipped placements — `default-bath1-basin` at rotation π sits on the south
 * wall facing north, and `bath2-basin` at π/2 sits on the west wall facing
 * east). Getting this sign wrong is exactly how the bed-head rug check went
 * wrong in v0.31.5.415, so it is verified rather than derived.
 *
 * Obstacles are projected onto the front axis and the perpendicular one; only
 * those whose perpendicular span overlaps the piece's own width count, so a
 * wardrobe is not "blocked" by something standing beside it. Mounted and noClip
 * pieces are skipped — they do not occupy floor.
 */
function clearanceToward(
  item: FurnitureItem,
  def: FurnitureDef,
  /** Unit direction in the plan, world-space. */
  fx: number,
  fz: number,
  others: Array<{ it: FurnitureItem; def: FurnitureDef }>,
  walls: PlanWall[],
  max: number,
): number {
  // Perpendicular (right-hand) axis in the plan.
  const px = fz
  const pz = -fx
  const corners = obbCorners(itemFootprint(item, def))
  let frontAlong = Number.NEGATIVE_INFINITY
  let halfLo = Number.POSITIVE_INFINITY
  let halfHi = Number.NEGATIVE_INFINITY
  const cx = item.position[0]
  const cz = item.position[1]
  for (const [x, z] of corners) {
    const a = (x - cx) * fx + (z - cz) * fz
    const p = (x - cx) * px + (z - cz) * pz
    frontAlong = Math.max(frontAlong, a)
    halfLo = Math.min(halfLo, p)
    halfHi = Math.max(halfHi, p)
  }
  let clear = max
  const consider = (pts: Array<readonly [number, number]>) => {
    let minA = Number.POSITIVE_INFINITY
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (const [x, z] of pts) {
      const a = (x - cx) * fx + (z - cz) * fz
      const p = (x - cx) * px + (z - cz) * pz
      minA = Math.min(minA, a)
      lo = Math.min(lo, p)
      hi = Math.max(hi, p)
    }
    // Must sit IN FRONT and overlap the piece's own width to block it.
    if (minA <= frontAlong) return
    if (Math.min(hi, halfHi) - Math.max(lo, halfLo) <= 0) return
    clear = Math.min(clear, minA - frontAlong)
  }
  for (const o of others) {
    if (o.def.mounted || o.def.noClip) continue
    consider(obbCorners(itemFootprint(o.it, o.def)) as Array<readonly [number, number]>)
  }
  for (const w of walls) {
    consider([
      [w.start[0], w.start[1]],
      [w.end[0], w.end[1]],
    ])
  }
  return clear
}

/** Local axes of an item in world space, under the RENDER rotation (three.js:
 *  local `+Z` -> `(sin θ, cos θ)`; see `headDir` for why that is the authority
 *  and `docs/ARCHITECTURE.md` for the v0.31.8.10 mirror bug that came of using a
 *  different one). `forward` is local +Z, `right` is local +X. */
function localAxes(item: FurnitureItem): {
  forward: [number, number]
  right: [number, number]
} {
  const rot = item.rotation ?? 0
  const s = Math.sin(rot)
  const c = Math.cos(rot)
  return { forward: [s, c], right: [c, -s] }
}

/** Clear floor straight out from a piece's FRONT face (local +Z). */
function frontClearance(
  item: FurnitureItem,
  def: FurnitureDef,
  others: Array<{ it: FurnitureItem; def: FurnitureDef }>,
  walls: PlanWall[],
  max: number,
): number {
  const [fx, fz] = localAxes(item).forward
  return clearanceToward(item, def, fx, fz, others, walls, max)
}

/**
 * A screen's rendered width (m) — the item's live resolved footprint width, so a
 * user who resizes a TV gets a band that follows it.
 */
function screenWidth(item: FurnitureItem, def: FurnitureDef): number {
  if (def.kind === 'parametric') {
    return resolveFootprintDims(def, item.props, {
      w: def.defaultFootprint.w,
      d: def.defaultFootprint.d,
    }).w
  }
  return def.defaultFootprint.w
}

/**
 * Is this def a TV, for the viewing-distance check?
 *
 * **Was `TV_RE = /^tv/`, which was wrong in BOTH directions (v0.31.8.19).** It
 * matched `tv-console` — a media console with no screen at all, so the check
 * reported a "TV viewing distance" to a piece of furniture — and it MISSED
 * `flatscreen-tv`, an actual TV whose id does not start with "tv". One name regex
 * measured the wrong thing and ignored the right one; the same class of mistake
 * as the rug anchor matching `rug-bedroom`.
 *
 * Selection now uses the authored screen capability (`isInteractableScreen` —
 * true for a def whose `paramSchema` carries a `screenContent` enum), which is
 * exactly {`tv-wall`, `flatscreen-tv`, `monitor`} and excludes the console by
 * construction.
 *
 * `monitor` is then excluded deliberately: a desk monitor is viewed at roughly
 * arm's length, which is a different published standard, and it is not in this
 * check's scope today. Applying a TV band to a 28" desk monitor would replace
 * one category error with another. Logged in `TODO.md`.
 */
function isTvScreen(def: FurnitureDef): boolean {
  return isInteractableScreen(def) && def.id !== 'monitor'
}

export interface CritiqueOptions {
  /**
   * Run the `route-access` check (default **false**).
   *
   * It rasterises the whole storey twice — measured at 63 ms on
   * `tpl-hdb-jumbo` even with the empty-plan baseline memoised — which is fine
   * for a report built once on demand and NOT fine for `schemeOptions`, which
   * calls this once per candidate layout. Turning it on there took the Scheme
   * Compare modal past a 15 s harness timeout that the same scenario clears on
   * the build without it. So the expensive check is opt-in, and only
   * `ui/report.ts` opts in.
   *
   * `score` excludes skipped checks, so it stays internally comparable on both
   * paths; it is simply computed over one more check where this is on.
   */
  routeAccess?: boolean
}

export function buildLayoutCritique(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  options: CritiqueOptions = {},
): LayoutCritique {
  const rooms = allPlanRooms(plan).filter((r) => planRoomArea(r) > 0)
  const findings: CritiqueFinding[] = []

  const resolved = items.flatMap((it) => {
    const def = defs[it.defId]
    return def?.defaultFootprint ? [{ it, def }] : []
  })
  const seating = resolved.filter(
    (r) => LOUNGE_ROLES.has(roleOf(r.it.defId, defs)) && r.it.defId !== 'ottoman',
  )
  const tvs = resolved.filter((r) => isTvScreen(r.def))
  const tables = resolved.filter((r) => TABLE_RE.test(r.it.defId))

  // 1 — TV viewing distance, per TV, to its NEAREST seat in the same room.
  //     The band is derived from THIS screen's diagonal (see `CRITIQUE`), so a
  //     55" and a 75" are not judged against one number.
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
      // 16:9 screen: diagonal = width x sqrt(1 + (9/16)^2). The width is the
      // item's own resolved footprint width, so a resized TV re-bands itself.
      const diagonal = screenWidth(tv.it, tv.def) * Math.sqrt(1 + (9 / 16) ** 2)
      const near = diagonal * CRITIQUE.tvDiagonalMin
      const far = diagonal * CRITIQUE.tvDiagonalMax
      const verdict = d >= near && d <= far ? 'pass' : 'warn'
      const inches = Math.round(diagonal / 0.0254)
      findings.push({
        id: 'tv-distance',
        label: 'TV viewing distance',
        verdict,
        detail: `${d.toFixed(2)} m from the nearest seat — a ${inches}" screen wants ${near.toFixed(2)}–${far.toFixed(2)} m (1.2x diagonal immersive to 1.6x relaxed).`,
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
      // Warn OUTSIDE Hall's social space, not outside the ideal — see
      // `CRITIQUE.convSocialMin`. Above `convIdealMax` still warns (further
      // apart than ideal, though still social) and above `convBreakdown` fails.
      const verdict =
        widest > CRITIQUE.convBreakdown
          ? 'fail'
          : widest >= CRITIQUE.convSocialMin && widest <= CRITIQUE.convIdealMax
            ? 'pass'
            : 'warn'
      findings.push({
        id: 'conversation',
        label: 'Conversation grouping',
        verdict,
        detail:
          verdict === 'fail'
            ? `Seats ${widest.toFixed(2)} m apart — past ${CRITIQUE.convBreakdown} m a group cannot hold one conversation.`
            : widest < CRITIQUE.convSocialMin
              ? `Seats only ${widest.toFixed(2)} m apart — closer than the ${CRITIQUE.convSocialMin} m social minimum, which reads as intimate rather than sociable.`
              : `Widest seat spacing ${widest.toFixed(2)} m (ideal ${CRITIQUE.convMin}–${CRITIQUE.convIdealMax} m; sociable from ${CRITIQUE.convSocialMin} m).`,
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

  // 6 — Storage access: `storageFront` clear in front of a piece you open and
  // stand at. Selected by the existing OPENABLE-CABINET PRIMITIVE FAMILY, never
  // by a name regex (a regex is a guess about a taxonomy that already exists —
  // how the rug check once matched `rug-bedroom` as its own anchor, v0.31.5.415)
  // and not by `category === 'storage'` either, which was the first cut and was
  // too wide: it dragged in NIGHTSTANDS (0.18 m², reached from the bed, where
  // 0.75 m of standing room in front is not a published requirement) and cube
  // shelving. That is the same error as applying the dining-rug threshold to a
  // bed — a cited number aimed at the wrong subject.
  //
  // A footprint-area cut was measured and rejected: the 0.5 m² obstacle bar
  // excludes nightstands correctly but also excludes a `utility-cabinet`
  // (0.20 m²) that genuinely had a washing machine 0.14 m in front of its door.
  // Size answers "do you walk around it"; this rule is about "do you open it".
  //
  // The FAMILY is used rather than `supportsCabinetOpen(def, props)` because
  // that helper asks whether there is something to ANIMATE, and answers no for a
  // SLIDING wardrobe — which still needs somewhere to stand and pass, even with
  // nothing to swing.
  {
    const storage = resolved.filter(
      (r) =>
        !r.def.mounted &&
        r.def.kind === 'parametric' &&
        OPENABLE_CABINET_PRIMITIVES.has(r.def.primitive),
    )
    if (storage.length === 0) {
      findings.push({
        id: 'storage-access',
        label: 'Storage access',
        verdict: 'skipped',
        detail: 'No floor-standing storage to measure.',
      })
    } else {
      const walls = allPlanWalls(plan)
      // Report the TIGHTEST piece, and say how many were measured — a single
      // worst case with a count is honest, where a bare "1 issue" hides scope.
      let worst: { name: string; clear: number; roomName?: string } | null = null
      for (const s of storage) {
        const others = resolved.filter((r) => r.it.id !== s.it.id)
        // Measured only up to the target: anything roomier is a pass and the
        // exact figure past 0.75 m carries no information for this check.
        const clear = frontClearance(s.it, s.def, others, walls, CRITIQUE.storageFront)
        if (!worst || clear < worst.clear)
          worst = { name: s.def.name, clear, roomName: roomAtItem(plan, s.it)?.name }
      }
      const tightest = worst as { name: string; clear: number; roomName?: string }
      const ok = tightest.clear >= CRITIQUE.storageFront - 1e-6
      findings.push({
        id: 'storage-access',
        label: 'Storage access',
        verdict: ok ? 'pass' : 'warn',
        // Named only on a WARN: the pass line is a statement about the whole
        // home, so attributing it to the tightest piece's room would imply the
        // check only looked there.
        ...(ok ? {} : { roomName: tightest.roomName }),
        detail: ok
          ? `All ${storage.length} storage ${storage.length === 1 ? 'piece has' : 'pieces have'} the recommended ${CRITIQUE.storageFront} m clear in front to open and pass.`
          : `${tightest.name} has ${tightest.clear.toFixed(2)} m clear in front — ${CRITIQUE.storageFront} m is recommended so a door or drawer opens and you can still pass (tightest of ${storage.length} measured).`,
      })
    }
  }

  // 7 — Bed access: at least ONE long side walkable. Selected by CATEGORY,
  // which for beds is a real taxonomy (`category === 'beds'`) — the same cut the
  // rug check uses for its anchor after a name regex matched `rug-bedroom`.
  {
    const beds = resolved.filter((r) => r.def.category === 'beds' && !r.def.mounted)
    if (beds.length === 0) {
      findings.push({
        id: 'bed-access',
        label: 'Bed access',
        verdict: 'skipped',
        detail: 'No bed to measure.',
      })
    } else {
      const walls = allPlanWalls(plan)
      let worst: { clear: number; roomName?: string } | null = null
      for (const b of beds) {
        // Only pieces that DEFINE a walkway block a bedside. A nightstand is part
        // of the bedside arrangement, not an obstruction to it — you step past
        // it, which is exactly what `CIRCULATION.obstacleArea`'s own docstring
        // says of anything under 0.5 m² ("lamps, plants, stools — you step
        // around; it never defines a walkway").
        //
        // Measured: without this the AUTHORED default flat warned at 0.24 m,
        // which is the gap from the bed's side face to its own nightstand. A
        // check that condemns a bed for having a bedside table is worse than no
        // check.
        //
        // Note this is the OPPOSITE call to `storage-access` above, and
        // deliberately so: there the question is "can you open this door", where
        // a small piece in the way still blocks it, and an area cut wrongly
        // excused a washing machine parked 0.14 m from a cabinet front. Here the
        // question is "is there a walkway", which is what the area bar is for.
        const others = resolved.filter(
          (r) =>
            r.it.id !== b.it.id &&
            r.def.defaultFootprint.w * r.def.defaultFootprint.d >= WALKWAY_OBSTACLE_AREA,
        )
        const { right } = localAxes(b.it)
        // The BETTER of the two long sides: the published rule is about the side
        // you get in and out on, so a bed against a wall on one side is fine.
        const sides = [
          clearanceToward(b.it, b.def, right[0], right[1], others, walls, CRITIQUE.bedSurround),
          clearanceToward(b.it, b.def, -right[0], -right[1], others, walls, CRITIQUE.bedSurround),
        ]
        const best = Math.max(...sides)
        if (!worst || best < worst.clear)
          worst = { clear: best, roomName: roomAtItem(plan, b.it)?.name }
      }
      const tightest = worst as { clear: number; roomName?: string }
      const ok = tightest.clear >= CRITIQUE.bedSurround - 1e-6
      findings.push({
        id: 'bed-access',
        label: 'Bed access',
        verdict: ok ? 'pass' : 'warn',
        ...(ok ? {} : { roomName: tightest.roomName }),
        detail: ok
          ? `Every bed has at least one long side with the recommended ${CRITIQUE.bedSurround} m to walk and make it up (${beds.length} measured).`
          : `The roomiest side of this bed is ${tightest.clear.toFixed(2)} m — ${CRITIQUE.bedSurround} m is the published minimum for getting in and out and making the bed (tightest of ${beds.length} measured).`,
      })
    }
  }

  // 8 — Route access: is every room you could walk into on the EMPTY plan still
  //     one you can walk into once this layout is placed?
  //
  // This is the only check here that is not a distance. v0.31.8.51 established
  // why it has to exist: `walkway.ts` measures GAPS, and dropping its 0.40 m
  // floor to catch blocked routes turned every `sofa ↔ coffee-table` adjacency
  // into a finding and halved the corpus's circulation score. Two pieces 0.05 m
  // apart are not a route anyone walks — what matters is whether they SEAL one,
  // which is a connectivity question. `layout/reachability.ts` answers it by
  // eroding the free floor by half a body and flood-filling what is left.
  //
  // The empty-plan baseline is subtracted, so a template that was never
  // connected (`tpl-hdb-4room`'s bedroom half has no interior door — see
  // `templateConnectivity.test.ts`) is not blamed on the furniture in it.
  {
    // Nothing on the floor can seal nothing, so an empty design SKIPS rather
    // than passing vacuously — and skipping also avoids the two raster passes.
    const onFloor = resolved.filter((r) => !r.def.mounted && !r.def.noClip)
    const skip = !options.routeAccess || rooms.length === 0 || onFloor.length === 0
    const severed = skip ? [] : findFurnitureSeveredRooms(items, defs, plan)
    if (skip) {
      findings.push({
        id: 'route-access',
        label: 'Route access',
        verdict: 'skipped',
        detail: !options.routeAccess
          ? 'Route access is measured in the report, not in this comparison.'
          : rooms.length === 0
            ? 'No rooms to measure.'
            : 'No floor-standing furniture to measure.',
      })
    } else if (severed.length === 0) {
      findings.push({
        id: 'route-access',
        label: 'Route access',
        verdict: 'pass',
        detail: `Every room you can walk into on the empty plan is still reachable with this layout (${rooms.length} measured).`,
      })
    } else {
      const worst = severed[0] as SeveredRoom
      findings.push({
        id: 'route-access',
        label: 'Route access',
        verdict: 'warn',
        roomName: worst.roomName,
        detail:
          severed.length === 1
            ? `${worst.roomName} is walled off by the furniture — ${worst.areaM2.toFixed(1)} m² of floor you can no longer walk to.`
            : `${severed.length} rooms are walled off by the furniture; the largest is ${worst.roomName} at ${worst.areaM2.toFixed(1)} m² of floor you can no longer walk to.`,
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
