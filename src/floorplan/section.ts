/**
 * Cross-section drawing (feature F32).
 *
 * A vertical section cut through the plan — companion to wall elevations. The
 * cut is a horizontal line across the plan, either at a fixed `x` (running
 * along Z) or a fixed `z` (running along X). Looking along the cut we project
 * everything onto a vertical plane and report, left→right along the OTHER axis:
 *
 *  - the floor line (y=0) and ceiling line (per-room ceiling height where set),
 *  - each wall the cut line crosses as a filled "cut" column (position along
 *    the section axis + thickness + floor→ceiling height, or `topHeight` for
 *    parapets),
 *  - openings on those cut walls as gaps with sill/head,
 *  - rooms the cut passes through as labelled floor segments,
 *  - furniture standing in the cut's room band (footprint straddling the cut
 *    line) projected onto the section plane as elevation silhouettes behind the
 *    cut — supplied by the caller as footprint corners + height so the core
 *    stays free of the impure footprint helpers.
 *
 * Walls running parallel to the cut (never crossed by the cut line) are
 * omitted — this is the cut profile only, not a full back-wall elevation.
 *
 * Pure + self-contained: imports only `./types`. All lengths in metres.
 */

import { allPlanRooms, GROUND_LEVEL_ID, isMultiLevel, levelAsPlan, planLevels } from './levels'
import { roomLabelPoint } from './roomCentroid'
import {
  type FloorPlan,
  type PlanOpening,
  type PlanRoom,
  type PlanVec2,
  type PlanWall,
  planBounds,
  roomPolygon,
  wallLength,
} from './types'

type SectionAxis = 'x' | 'z'

export interface SectionCut {
  /** Which world axis the cut line is fixed on. `'x'` → a vertical plane at
   *  x=at running along Z; `'z'` → a plane at z=at running along X. */
  axis: SectionAxis
  /** The fixed coordinate of the cut line (metres). */
  at: number
}

/** A wall the cut crosses, as a filled column on the section. */
interface SectionWall {
  /** Centre position along the section axis (the non-fixed axis), metres. */
  pos: number
  /** Wall thickness (metres) — its visible width in the section. */
  thickness: number
  /** Bottom of the column (floor), metres. Always 0 here. */
  base: number
  /** Top of the column (ceiling, or `topHeight` for parapets), metres. */
  top: number
  /** True — every wall reported here is a cut wall. */
  cut: boolean
}

/** An opening on a cut wall, as a gap in that wall column. */
interface SectionOpening {
  /** Centre position along the section axis, metres. */
  pos: number
  /** Visible width of the gap along the section axis, metres. */
  width: number
  /** Bottom of the gap above floor, metres (0 for doors). */
  sill: number
  /** Top of the gap above floor, metres. */
  head: number
  kind: 'door' | 'window'
}

/** A room the cut passes through, as a labelled floor segment. */
interface SectionRoom {
  name: string
  /** Floor height of the storey this room sits on, metres (0 = ground). */
  base: number
  /** Start position along the section axis, metres. */
  start: number
  /** End position along the section axis, metres. */
  end: number
}

/** Input silhouette for furniture seen *beyond* the cut, computed by the caller
 *  (which owns the impure footprint helpers) so the core stays dependency-free:
 *  the piece's floor footprint corners (world metres) + its above-floor height. */
export interface SectionItemInput {
  id: string
  label: string
  /** Footprint corners in world XZ metres. */
  corners: PlanVec2[]
  /** Above-floor height in metres. */
  height: number
  /** The storey this piece stands on (absent = ground). Used to place it at
   *  that storey's floor level; a multi-storey section that ignored this drew
   *  every piece standing on the ground slab. */
  levelId?: string
}

/** A furniture piece projected onto the section plane (elevation of what stands
 *  in the room band the cut passes through, drawn behind the cut walls). */
interface SectionItem {
  id: string
  label: string
  /** Start position along the section axis, metres. */
  start: number
  /** End position along the section axis, metres. */
  end: number
  /** Above-floor height in metres. */
  height: number
  /** Floor height of the storey it stands on, metres (0 = ground). */
  base: number
}

/** A ceiling run at height `y` spanning `[start,end]` along the section axis. */
interface SectionCeil {
  start: number
  end: number
  y: number
}

export interface Section {
  axis: SectionAxis
  at: number
  /** Span of the section along the non-fixed axis, metres. */
  length: number
  /** Overall section height (max ceiling / wall top), metres. */
  height: number
  walls: SectionWall[]
  openings: SectionOpening[]
  rooms: SectionRoom[]
  /** Furniture standing in the cut's room band, shown in elevation behind the
   *  cut (empty when no silhouettes were supplied — e.g. a bare shell). */
  items: SectionItem[]
  /** Floor line height, metres (0) — the GROUND slab. Upper storeys carry
   *  their own floor height on each room/item `base`. */
  floorY: number
  ceil: SectionCeil[]
}

/** Default fall-back ceiling height (metres) when nothing else is known. */
const DEFAULT_CEIL = 2.8
/** Half a millimetre — tolerance for "on the line" / degenerate spans. */
const EPS = 5e-4

function isArr<T>(v: unknown): v is T[] {
  return Array.isArray(v)
}

function thicknessM(w: PlanWall): number {
  return w.thickness === 'external' ? 0.2 : 0.1
}

/** Plan extent along the non-fixed (section) axis, as a fall-back span. */
function planSpan(plan: FloorPlan, axis: SectionAxis): number {
  const ext = isArr<number>(plan.extent) ? plan.extent : [0, 0]
  const v = axis === 'x' ? ext[1] : ext[0]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** Coordinate of a point along the fixed axis (the one the cut is at). */
function fixedOf(p: PlanVec2, axis: SectionAxis): number {
  return axis === 'x' ? p[0] : p[1]
}

/** Coordinate of a point along the section axis (the one we lay out left→right). */
function alongOf(p: PlanVec2, axis: SectionAxis): number {
  return axis === 'x' ? p[1] : p[0]
}

/**
 * Where (along the section axis) a segment crosses the cut line `fixed=at`,
 * or `null` if it does not cross (parallel / outside its fixed-span). A segment
 * touching the line only at an endpoint is treated as crossing at that point.
 */
function crossAlong(a: PlanVec2, b: PlanVec2, axis: SectionAxis, at: number): number | null {
  const fa = fixedOf(a, axis)
  const fb = fixedOf(b, axis)
  const min = Math.min(fa, fb)
  const max = Math.max(fa, fb)
  if (at < min - EPS || at > max + EPS) return null
  if (Math.abs(fb - fa) < EPS) {
    // Segment runs parallel to (along) the cut and lies on it: not a crossing.
    return null
  }
  const t = (at - fa) / (fb - fa)
  const tc = Math.min(1, Math.max(0, t))
  const aa = alongOf(a, axis)
  const ba = alongOf(b, axis)
  return aa + (ba - aa) * tc
}

/**
 * Build a vertical section through `plan` at `cut`. Defensive: guards
 * non-array walls/openings/rooms, an empty plan, and a cut line outside the
 * plan bounds (→ an empty section, never throws). All values clamped ≥ 0.
 */
export function buildSection(
  plan: FloorPlan,
  cut: SectionCut,
  silhouettes: SectionItemInput[] = [],
): Section {
  // The core is documented as defensive about a malformed plan, so the
  // multi-storey branch must not read off it first — `isMultiLevel(null)`
  // throws (caught by the pre-existing "guards an empty / malformed plan" test).
  if (!plan || typeof plan !== 'object') return buildLevelSection(plan, cut, silhouettes)
  // MULTI-STOREY (F13). A section is THE drawing where storeys matter — it is
  // the one sheet a contractor reads to see how the levels stack — and this
  // built the ground floor only, so a maisonette's section showed an open-topped
  // ground floor with nothing above it. Each storey is now cut independently and
  // its geometry lifted to that storey's `elevation`, giving one stacked section.
  //
  // Kept as a wrapper rather than threading levels through the core: the core is
  // 250 lines of single-plane geometry that is correct as written, and every
  // multi-storey concern here is a Y offset applied afterwards.
  if (isMultiLevel(plan)) {
    const levels = planLevels(plan)
    const parts = levels.map((level) =>
      liftSection(
        buildLevelSection(
          levelAsPlan(plan, level),
          cut,
          // Silhouettes are level-tagged; without this filter every piece in
          // the home would be drawn once per storey.
          safeSilhouettes(silhouettes).filter(
            (sil) => (sil.levelId ?? GROUND_LEVEL_ID) === level.id,
          ),
        ),
        level.elevation,
      ),
    )
    const nonEmpty = parts.filter((p) => p.walls.length > 0 || p.rooms.length > 0)
    const kept = nonEmpty.length > 0 ? nonEmpty : parts
    return {
      axis: parts[0]!.axis,
      at: parts[0]!.at,
      length: Math.max(...kept.map((p) => p.length)),
      height: Math.max(...kept.map((p) => p.height)),
      walls: kept.flatMap((p) => p.walls),
      openings: kept.flatMap((p) => p.openings),
      rooms: kept.flatMap((p) => p.rooms),
      // Tallest-first across the whole stack, preserving the core's paint order.
      items: kept.flatMap((p) => p.items).sort((a, b) => b.height - a.height),
      floorY: 0,
      ceil: kept.flatMap((p) => p.ceil),
    }
  }
  return buildLevelSection(plan, cut, silhouettes)
}

/** Lift one storey's section by `dy` metres. Every height in the section is
 *  ABSOLUTE (the renderer maps them straight through `y()`), so raising a
 *  storey is a uniform offset — no geometry is re-derived. */
function liftSection(sec: Section, dy: number): Section {
  if (!(Number.isFinite(dy) && dy !== 0)) return sec
  return {
    ...sec,
    height: sec.height + dy,
    walls: sec.walls.map((w) => ({ ...w, base: w.base + dy, top: w.top + dy })),
    openings: sec.openings.map((o) => ({ ...o, sill: o.sill + dy, head: o.head + dy })),
    rooms: sec.rooms.map((r) => ({ ...r, base: r.base + dy })),
    items: sec.items.map((it) => ({ ...it, base: it.base + dy })),
    ceil: sec.ceil.map((c) => ({ ...c, y: c.y + dy })),
  }
}

/** Cut ONE storey. `plan` must be single-level (the plan itself, or a
 *  `levelAsPlan` result) — every read below is single-level by design. */
function buildLevelSection(
  plan: FloorPlan,
  cut: SectionCut,
  silhouettes: SectionItemInput[] = [],
): Section {
  const axis: SectionAxis = cut?.axis === 'x' ? 'x' : 'z'
  const at = typeof cut?.at === 'number' && Number.isFinite(cut.at) ? cut.at : 0
  const empty: Section = {
    axis,
    at,
    length: 0,
    height: 0,
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    floorY: 0,
    ceil: [],
  }
  if (!plan || typeof plan !== 'object') return empty

  const walls = isArr<PlanWall>(plan.walls) ? plan.walls : []
  const openings = isArr<PlanOpening>(plan.openings) ? plan.openings : []
  const rooms = isArr<PlanRoom>(plan.rooms) ? plan.rooms : []

  const planCeil =
    typeof plan.ceilingHeight === 'number' && plan.ceilingHeight > 0
      ? plan.ceilingHeight
      : DEFAULT_CEIL

  // Bounds along the fixed axis: if the cut line lies entirely outside every
  // wall/room, there is nothing to cut → empty section.
  let fMin = Number.POSITIVE_INFINITY
  let fMax = Number.NEGATIVE_INFINITY
  const noteFixed = (v: number) => {
    if (v < fMin) fMin = v
    if (v > fMax) fMax = v
  }
  for (const w of walls) {
    if (!w || !isArr<number>(w.start) || !isArr<number>(w.end)) continue
    noteFixed(fixedOf(w.start, axis))
    noteFixed(fixedOf(w.end, axis))
  }
  for (const r of rooms) {
    const poly = safePolygon(r)
    for (const p of poly) noteFixed(fixedOf(p, axis))
  }
  if (!Number.isFinite(fMin) || !Number.isFinite(fMax)) return empty
  if (at < fMin - EPS || at > fMax + EPS) return empty

  // --- Cut walls + their openings -----------------------------------------
  const sectionWalls: SectionWall[] = []
  const sectionOpenings: SectionOpening[] = []
  let maxTop = 0

  for (const w of walls) {
    if (!w || !isArr<number>(w.start) || !isArr<number>(w.end)) continue
    const pos = crossAlong(w.start, w.end, axis, at)
    if (pos === null) continue

    const ceilHere = ceilingAt(rooms, w.start, w.end, axis, at, planCeil)
    const parapet = typeof w.topHeight === 'number' && w.topHeight > 0 ? w.topHeight : undefined
    const top = Math.max(0, parapet ?? ceilHere)
    sectionWalls.push({ pos, thickness: thicknessM(w), base: 0, top, cut: true })
    if (top > maxTop) maxTop = top

    // Openings on this wall → gaps. The cut crosses the wall at a single point,
    // so an opening contributes a gap only when the cut line falls within the
    // opening's run along the wall.
    const len = wallLength(w)
    if (len < EPS) continue
    for (const o of openings) {
      if (!o || o.wallId !== w.id) continue
      const off = clampNum(o.offset, 0, len)
      const wid = clampNum(o.width, 0, len - off)
      const dCut = crossDistAlongWall(w, axis, at)
      if (dCut === null) continue
      if (dCut < off - EPS || dCut > off + wid + EPS) continue
      const sill = o.kind === 'door' ? 0 : Math.max(0, o.sill ?? 0)
      const head = Math.max(sill, o.head ?? top)
      sectionOpenings.push({
        pos,
        // The gap's width in the SECTION is the wall's THICKNESS, not the
        // opening's run along its own wall. A cut wall is perpendicular to the
        // section axis: you see the wall as a thin column and the opening as a
        // void punched through that column. Using the opening width drew a
        // 1.2 m window as a 1.2 m-wide hole in a 0.2 m wall — six times too
        // wide, spilling across the neighbouring rooms. Seen in the Open Loft
        // report frame while verifying the stacked section (v0.31.5.383);
        // `wid` is still what decides WHETHER the cut hits the opening above.
        width: thicknessM(w),
        sill,
        head: Math.min(head, top),
        kind: o.kind === 'door' ? 'door' : 'window',
      })
    }
  }

  // --- Rooms the cut passes through → labelled floor segments + ceiling ----
  const sectionRooms: SectionRoom[] = []
  const ceil: SectionCeil[] = []
  for (const r of rooms) {
    const poly = safePolygon(r)
    if (poly.length < 3) continue
    const spans = polygonCutSpans(poly, axis, at)
    if (spans.length === 0) continue
    const rCeil =
      typeof r.ceilingHeight === 'number' && r.ceilingHeight > 0 ? r.ceilingHeight : planCeil
    for (const [s, e] of spans) {
      if (e - s < EPS) continue
      sectionRooms.push({
        name: typeof r.name === 'string' ? r.name : '',
        start: s,
        end: e,
        base: 0,
      })
      ceil.push({ start: s, end: e, y: rCeil })
      if (rCeil > maxTop) maxTop = rCeil
    }
  }
  sectionRooms.sort((p, q) => p.start - q.start)
  ceil.sort((p, q) => p.start - q.start)
  sectionWalls.sort((p, q) => p.pos - q.pos)
  sectionOpenings.sort((p, q) => p.pos - q.pos)

  // --- Furniture beyond the cut → elevation silhouettes --------------------
  // A piece counts as "in the cut's room band" when its footprint straddles the
  // cut line along the fixed axis (so it is what you would see looking along the
  // cut). It is drawn flattened onto the section: its along-axis extent × height.
  const sectionItems: SectionItem[] = []
  for (const sil of safeSilhouettes(silhouettes)) {
    let fLo = Number.POSITIVE_INFINITY
    let fHi = Number.NEGATIVE_INFINITY
    let aLo = Number.POSITIVE_INFINITY
    let aHi = Number.NEGATIVE_INFINITY
    for (const p of sil.corners) {
      const fx = fixedOf(p, axis)
      const ax = alongOf(p, axis)
      if (fx < fLo) fLo = fx
      if (fx > fHi) fHi = fx
      if (ax < aLo) aLo = ax
      if (ax > aHi) aHi = ax
    }
    // Footprint must straddle the cut line on the fixed axis.
    if (at < fLo - EPS || at > fHi + EPS) continue
    if (aHi - aLo < EPS) continue
    const h = sil.height > 0 ? sil.height : 0
    if (h < EPS) continue
    sectionItems.push({ id: sil.id, label: sil.label, start: aLo, end: aHi, height: h, base: 0 })
    if (h > maxTop) maxTop = h
  }
  // Tallest-first so a renderer painting in order keeps shorter pieces on top.
  sectionItems.sort((p, q) => q.height - p.height)

  // --- Section span (length) -----------------------------------------------
  let aMin = Number.POSITIVE_INFINITY
  let aMax = Number.NEGATIVE_INFINITY
  const noteAlong = (v: number) => {
    if (v < aMin) aMin = v
    if (v > aMax) aMax = v
  }
  for (const w of sectionWalls) {
    noteAlong(w.pos - w.thickness / 2)
    noteAlong(w.pos + w.thickness / 2)
  }
  for (const r of sectionRooms) {
    noteAlong(r.start)
    noteAlong(r.end)
  }
  for (const it of sectionItems) {
    noteAlong(it.start)
    noteAlong(it.end)
  }
  let length = 0
  if (Number.isFinite(aMin) && Number.isFinite(aMax)) {
    length = Math.max(0, aMax - aMin)
  }
  if (length < EPS) length = planSpan(plan, axis)

  const height = maxTop > 0 ? maxTop : planCeil

  return {
    axis,
    at,
    length,
    height,
    walls: sectionWalls,
    openings: sectionOpenings,
    rooms: sectionRooms,
    items: sectionItems,
    floorY: 0,
    ceil,
  }
}

/** Validate the caller-supplied silhouettes (drop malformed ones). */
function safeSilhouettes(list: unknown): SectionItemInput[] {
  if (!isArr<SectionItemInput>(list)) return []
  return list.filter(
    (s): s is SectionItemInput =>
      !!s &&
      typeof s === 'object' &&
      typeof s.id === 'string' &&
      typeof s.label === 'string' &&
      typeof s.height === 'number' &&
      Number.isFinite(s.height) &&
      isArr<PlanVec2>(s.corners) &&
      s.corners.length >= 3 &&
      s.corners.every((p) => isArr<number>(p) && p.length >= 2),
  )
}

function clampNum(v: unknown, lo: number, hi: number): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : 0
  return Math.min(Math.max(x, lo), Math.max(lo, hi))
}

/** Room polygon, guarded against malformed rooms. */
function safePolygon(r: PlanRoom | undefined): PlanVec2[] {
  if (!r || typeof r !== 'object') return []
  try {
    const poly = roomPolygon(r)
    return isArr<PlanVec2>(poly) ? poly.filter((p) => isArr<number>(p) && p.length >= 2) : []
  } catch {
    return []
  }
}

/** Highest ceiling among rooms containing the wall's crossing point. */
function ceilingAt(
  rooms: PlanRoom[],
  start: PlanVec2,
  end: PlanVec2,
  axis: SectionAxis,
  at: number,
  fallback: number,
): number {
  const pos = crossAlong(start, end, axis, at)
  if (pos === null) return fallback
  const wx = axis === 'x' ? at : pos
  const wz = axis === 'x' ? pos : at
  // A perimeter wall sits ON its room's boundary, so the crossing point itself
  // is not strictly inside any polygon. Probe a small nudge in every direction
  // so the wall picks up its adjacent room's ceiling.
  const d = 0.02
  const samples: PlanVec2[] = [
    [wx, wz],
    [wx + d, wz],
    [wx - d, wz],
    [wx, wz + d],
    [wx, wz - d],
  ]
  let best = fallback
  let found = false
  for (const r of rooms) {
    const poly = safePolygon(r)
    if (poly.length < 3) continue
    if (!samples.some(([sx, sz]) => pointInPoly(sx, sz, poly))) continue
    const rc =
      typeof r.ceilingHeight === 'number' && r.ceilingHeight > 0 ? r.ceilingHeight : fallback
    if (!found || rc > best) best = rc
    found = true
  }
  return best
}

/** Even-odd point-in-polygon (local copy to stay self-contained). */
function pointInPoly(x: number, z: number, pts: PlanVec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]!
    const [xj, zj] = pts[j]!
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Distance along a wall (from its start) at which the cut line crosses it. */
function crossDistAlongWall(w: PlanWall, axis: SectionAxis, at: number): number | null {
  const fa = fixedOf(w.start, axis)
  const fb = fixedOf(w.end, axis)
  if (Math.abs(fb - fa) < EPS) return null
  const t = (at - fa) / (fb - fa)
  if (t < -EPS || t > 1 + EPS) return null
  return Math.min(1, Math.max(0, t)) * wallLength(w)
}

/**
 * The intervals (along the section axis) where the cut line lies inside a
 * polygon — the room's floor footprint on the section. Sweeps the polygon's
 * edge crossings of the cut line and pairs them up (even-odd).
 */
function polygonCutSpans(poly: PlanVec2[], axis: SectionAxis, at: number): Array<[number, number]> {
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const fa = fixedOf(a, axis)
    const fb = fixedOf(b, axis)
    // Half-open crossing test (count the lower endpoint, skip the upper) so a
    // vertex exactly on the cut line is not double-counted.
    if (fa > at !== fb > at) {
      const t = (at - fa) / (fb - fa)
      const aa = alongOf(a, axis)
      const ba = alongOf(b, axis)
      xs.push(aa + (ba - aa) * t)
    }
  }
  xs.sort((p, q) => p - q)
  const spans: Array<[number, number]> = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    spans.push([xs[i]!, xs[i + 1]!])
  }
  return spans
}

/** A conventional section cut plus the letter its marks and sheet carry. */
export interface MarkedSectionCut {
  cut: SectionCut
  /** Mark letter — the sheet reads "Section A–A", the plan marks read "A". */
  mark: string
}

/**
 * The two conventional cuts a drawing set carries — one CROSS section
 * (`axis: 'z'`, looking along Z) marked A and one LONGITUDINAL section
 * (`axis: 'x'`) marked B.
 *
 * Position is chosen to be INFORMATIVE rather than blindly mid-plan: each
 * candidate is scored by how much the cut line actually crosses (rooms passed
 * through + walls cut), so a cut cannot land down an empty corridor and produce
 * a near-featureless section. Candidates are the room label points (a cut
 * through room centres reads well) plus the plan midpoint as a floor. Ties
 * break toward the LOWER coordinate, so the result is deterministic.
 *
 * Returns only cuts that actually cross something — a plan with no walls
 * yields an empty list rather than two empty sheets.
 */
export function conventionalSectionCuts(plan: FloorPlan): MarkedSectionCut[] {
  if (!plan?.walls?.length) return []
  const [maxX, maxZ] = planBounds(plan)
  const out: MarkedSectionCut[] = []

  for (const [axis, mark, mid] of [
    ['z', 'A', maxZ / 2],
    ['x', 'B', maxX / 2],
  ] as const) {
    // Candidate positions: every room's label point on this axis, plus the
    // plan midpoint. Deduped and sorted so scoring order is deterministic.
    const fromRooms = allPlanRooms(plan).map((r) => roomLabelPoint(r)[axis === 'z' ? 1 : 0])
    const candidates = [...new Set([...fromRooms, mid].map((v) => Math.round(v * 1000) / 1000))]
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)

    let best: { at: number; score: number } | null = null
    for (const at of candidates) {
      const s = buildSection(plan, { axis, at })
      const score = s.rooms.length + s.walls.length
      // Strict > keeps the FIRST (lowest) position on a tie.
      if (score > 0 && (!best || score > best.score)) best = { at, score }
    }
    if (best) out.push({ cut: { axis, at: best.at }, mark })
  }
  return out
}
