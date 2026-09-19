import { FLAT } from './constants'
import { hdbScaledCutout } from './hdbScaleAudit'
import type { WallSpec } from './types'
import { OPENING_CLEARANCE } from './walls/wallBodyShape'
import { orientOutward } from './walls/wallRevealMath'

export interface WallSegment {
  /** X-position along the wall axis (start). */
  start: number
  /** X-position along the wall axis (end). */
  end: number
  /** Bottom height. */
  bottom: number
  /** Top height. */
  top: number
}

/** Returns the solid wall segments to render, given a wall spec. */
export function buildWallSegments(wall: WallSpec, ceilingHeight: number): WallSegment[] {
  const segments: WallSegment[] = []
  const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
  // HDB-SCALE-AUDIT: the hole in the wall is resolved through the same corrector as the
  // leaf, so a door whose published opening differs from the flat's 800 x 2100 default
  // (the household-shelter blast door) cannot end up with a leaf and a hole that disagree.
  const cutouts = wall.cutouts.map(hdbScaledCutout).sort((a, b) => a.offset - b.offset)
  const wallTop = wall.topHeight ?? ceilingHeight

  // Solid spans between cutouts (run up to the wall top — ceiling for normal
  // walls, parapet height for half walls).
  let cursor = 0
  for (const c of cutouts) {
    if (c.offset > cursor) {
      segments.push({ start: cursor, end: c.offset, bottom: 0, top: wallTop })
    }
    cursor = c.offset + c.width
  }
  if (cursor < wallLength) {
    segments.push({ start: cursor, end: wallLength, bottom: 0, top: wallTop })
  }

  // Sill below windows
  for (const c of cutouts) {
    if (c.kind === 'window' && c.sill > 0) {
      segments.push({
        start: c.offset,
        end: c.offset + c.width,
        bottom: 0,
        top: Math.min(c.sill, wallTop),
      })
    }
  }

  // Header above doors and windows (only for full-height walls)
  for (const c of cutouts) {
    if (c.head < wallTop) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: c.head, top: wallTop })
    }
  }

  return segments
}

// Active wall-thickness state (m) for the curated flat, held at module scope so
// pure consumers (collision + geometry) stay in sync without signature churn;
// React renderers also subscribe to the relevant `floorPlan` fields so they
// re-render when it changes (see state/store.ts subscription). Two layers:
//  - default per category (the plan-wide `wallThickness` setting), and
//  - a per-wall override map keyed by wall id (the default plan's `PlanWall.thicknessM`,
//    whose ids match the curated WALLS — buildDefaultPlan), edited in the 2D inspector.
let externalT = FLAT.externalWallThickness
let internalT = FLAT.internalWallThickness
let perWallOverride: Record<string, number> = {}

/** Set the curated flat's default wall thicknesses (m). Falsy/absent values
 *  reset to the built-in 0.2 m external / 0.1 m internal. */
export function setFlatWallThicknessDefaults(d?: { external?: number; internal?: number }): void {
  externalT = d?.external && d.external > 0 ? d.external : FLAT.externalWallThickness
  internalT = d?.internal && d.internal > 0 ? d.internal : FLAT.internalWallThickness
}

/** Set per-wall thickness overrides (m) by wall id for the curated flat, from
 *  the active plan's walls (`PlanWall.thicknessM`). Non-positive/absent ignored. */
export function setFlatWallThicknessOverrides(
  walls?: readonly { id: string; thicknessM?: number }[],
): void {
  const m: Record<string, number> = {}
  if (walls) for (const w of walls) if (w.thicknessM && w.thicknessM > 0) m[w.id] = w.thicknessM
  perWallOverride = m
}

export function wallThicknessMetres(wall: WallSpec): number {
  const o = perWallOverride[wall.id]
  if (o != null) return o
  // Fall back to the wall's OWN static override (mirrors `PlanWall.thicknessM`
  // — `buildDefaultPlan` copies it through 1:1, and the live app's store
  // subscription re-populates `perWallOverride` from that copy, but a bare
  // unit test that imports `WALLS`/calls this directly without touching the
  // store never runs that subscription). Reading it here makes a curated
  // flat wall's declared thickness (e.g. `wall-ext-S`/the household-shelter
  // ring, both 300 mm RC) correct with or without store initialization.
  if (wall.thicknessM != null && wall.thicknessM > 0) return wall.thicknessM
  return wall.thickness === 'external' ? externalT : internalT
}

/** The wall that this wall's start/end abuts (its endpoint lies on the other
 *  wall's centreline span), or null if the endpoint is free. */
export function wallEndAbutmentNeighbor(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): WallSpec | null {
  const point = atStart ? wall.start : wall.end
  for (const other of allWalls) {
    if (other.id === wall.id) continue
    const dx = other.end[0] - other.start[0]
    const dz = other.end[1] - other.start[1]
    const len = Math.hypot(dx, dz)
    if (len === 0) continue
    const tx = dx / len
    const tz = dz / len
    const px = point[0] - other.start[0]
    const pz = point[1] - other.start[1]
    const along = px * tx + pz * tz
    const perp = Math.abs(px * -tz + pz * tx)
    if (perp < 1e-3 && along > -1e-3 && along < len + 1e-3) {
      return other
    }
  }
  return null
}

/** Returns the thickness of the wall that this wall's start/end abuts, or 0
 *  if the endpoint is free (does not lie on any other wall's centerline). */
export function wallEndAbutmentThickness(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): number {
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  return other ? wallThicknessMetres(other) : 0
}

/**
 * Signed corner abutment (metres) for the orbit wall body + finish faces at one
 * end — the amount to extend (+) or retract (−) that end so two walls meeting at
 * a corner tile it as ONE clean surface with **no doubled translucency and no
 * z-fight**:
 *
 *  - At a corner exactly ONE wall SPANS it (chosen deterministically by wall id)
 *    and extends by the neighbour's half-thickness to fill the corner square.
 *  - The other wall BUTTS: it retracts to the spanner's near face, then a hair
 *    further (`OPENING_CLEARANCE`) so its end-cap is *buried inside* the spanner
 *    rather than sitting COPLANAR with it. Coplanar faces z-fight; a fully
 *    overlapping (extend-both) corner double-composites two translucent walls and
 *    reads darker. Burying the butt end by ε avoids both — the same trick doors/
 *    windows use to overlap their jambs (see `OPENING_CLEARANCE`).
 *
 * Free ends (no abutting wall) return 0. Symmetric: at any shared corner one
 * wall's id wins the tie-break so exactly one spans and one butts, and both agree.
 */
const CORNER_EPS = 0.02 // m: endpoints within this are "the same corner"

export function wallCornerAbut(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
  clearance = OPENING_CLEARANCE,
): number {
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return 0
  const half = wallThicknessMetres(other) / 2
  const point = atStart ? wall.start : wall.end
  const near = (p: readonly [number, number]) =>
    Math.hypot(p[0] - point[0], p[1] - point[1]) < CORNER_EPS
  // Does the NEIGHBOUR also end here, or does it run through?
  const mutual = near(other.start) || near(other.end)
  // A T-JUNCTION (the neighbour runs through) always RETRACTS to the through
  // wall's near face. There is no corner notch to fill — only this wall ends
  // here — so the spanner half of the tie-break has nothing to do except drive
  // this body from the through wall's centreline all the way to its FAR face,
  // overlapping it by the neighbour's FULL thickness. That is invisible while
  // both are opaque and a hard-edged double-composite the moment they fade: a
  // 100 mm partition into a 100 mm partition hides a 100 mm block, but the same
  // partition into a 300 mm RC wall paints a 300 mm-wide, full-height bright
  // band down the reveal. Which of the two it did came down to `wall.id <
  // other.id` — an alphabetical coin-flip.
  if (!mutual) return -(half - clearance)
  // A true corner where BOTH walls end: one must span to fill the notch, the
  // other butts into it. Id order is an arbitrary but STABLE tie-break, and the
  // spanner's extra length is genuinely buried inside its neighbour.
  return wall.id < other.id ? half : -(half - clearance)
}

/** True when two walls run along the SAME line (parallel or anti-parallel
 *  direction vectors), as opposed to turning to a different axis. A wall
 *  split end-to-end into differently-thickened pieces along one straight run
 *  — e.g. `wall-ext-N-pier` carved out of the north wall between
 *  `wall-ext-N-west`/`wall-ext-N-east` purely for its own structural
 *  classification — is NOT a corner: both segments simply continue the same
 *  line, their declared endpoints already coincide with zero gap, and there
 *  is no notch to fill and no diagonal to cut. */
function wallsCollinear(a: WallSpec, b: WallSpec): boolean {
  const ax = a.end[0] - a.start[0]
  const az = a.end[1] - a.start[1]
  const bx = b.end[0] - b.start[0]
  const bz = b.end[1] - b.start[1]
  const alen = Math.hypot(ax, az) || 1
  const blen = Math.hypot(bx, bz) || 1
  // Cross product of the unit directions is ~0 exactly when parallel/anti-parallel.
  const cross = (ax / alen) * (bz / blen) - (az / alen) * (bx / blen)
  return Math.abs(cross) < 1e-3
}

/** A COLUMN STUB, not a wall run: a segment shorter than it is thick. The default
 *  flat models four of them (`wall-col-nw`, `-b2b3`, `-b3-ne`, `-ld-ne`) as 250 mm
 *  long x 300 mm RC pieces laid over a corner to carry the extra structural mass
 *  the plan shows there. A stub is neither a mitre partner nor a straight
 *  continuation — it sits ON the junction rather than running out of it, and
 *  letting one veto its corner is what un-mitred the building's own outside
 *  corners at (0.1, 0.1) and (9.175, 0.1). It simply butts. */
function isColumnStub(wall: WallSpec): boolean {
  return (
    Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) <
    wallThicknessMetres(wall) - 1e-9
  )
}

/** Unit direction from `point` into `wall`'s BODY (its far endpoint). */
function dirIntoBody(wall: WallSpec, point: readonly [number, number]): [number, number] {
  const d0 = Math.hypot(wall.start[0] - point[0], wall.start[1] - point[1])
  const d1 = Math.hypot(wall.end[0] - point[0], wall.end[1] - point[1])
  const far = d0 >= d1 ? wall.start : wall.end
  const x = far[0] - point[0]
  const z = far[1] - point[1]
  const len = Math.hypot(x, z) || 1
  return [x / len, z / len]
}

/** Is `other` the STRAIGHT CONTINUATION of `wall` past `point` — collinear AND
 *  running the OPPOSITE way, so the two are one run split in two (the north wall's
 *  structural pier, the corridor/shelter run, the two halves of the west wall)?
 *  A run continues; it never mitres. Collinearity alone is not enough: the column
 *  stubs that model extra RC mass (`wall-col-nw`, `wall-col-b3-ne`) lie collinear
 *  with a wall but reach BACK along it, and vetoing the corner on their account is
 *  what un-mitred the building's own outside corners. */
function isStraightContinuation(
  wall: WallSpec,
  other: WallSpec,
  point: readonly [number, number],
): boolean {
  if (!wallsCollinear(wall, other)) return false
  const a = dirIntoBody(wall, point)
  const b = dirIntoBody(other, point)
  return a[0] * b[0] + a[1] * b[1] < 0
}

/** How this wall's end joins its neighbour. `miter` = a true L-corner (both walls
 *  END at the shared point, turning to a different axis) — the walls are cut to
 *  the corner's angle-bisector so each takes half with a seamless (backface-
 *  culled) diagonal seam. `butt` = a T-junction (this end lands mid-span of a
 *  through-wall), OR a mutual end where both walls run along the SAME line (a
 *  structural-pier split, not a corner) — the buried span/butt tiling (or, for
 *  the collinear case, a plain zero-gap join), whose `abut` buries the end so it
 *  neither doubles nor z-fights. `free` = open end. */
export type CornerJoin =
  | { kind: 'free'; abut: 0 }
  | { kind: 'miter'; abut: number }
  | { kind: 'butt'; abut: number }

/** Classify (and size) how this wall's start/end joins whatever it meets. A true
 *  L-corner mitres (ANY thickness — the slope, computed in `wallCornerMiter`,
 *  carries the thickness ratio); its `abut` extends by the NEIGHBOUR's half-
 *  thickness so the mitre's long side reaches the shared outer corner. */
/** Everything this wall's start/end meets: the other walls that also END here
 *  (`mutual`), the wall this end lands MID-SPAN of (`through`, a T-junction), and
 *  the single neighbour this end should MITRE with (`partner`, null when none).
 *
 *  **A corner mitres only when the two ends choose each other.** Each end prefers
 *  the LONGEST non-collinear neighbour that also ends here — and prefers NOTHING
 *  when one of its mutual neighbours is COLLINEAR with it, because two collinear
 *  segments are one straight run and a run never mitres, it continues. So at a
 *  junction where three ends meet — the B3 north-east column stub over the
 *  `wall-ext-N-east` / `wall-ext-NE-jog-W` corner, or the household-shelter's
 *  `wall-int-bath2-hs` stub landing on the collinear `wall-int-mid-S` /
 *  `wall-int-hs-S` run — the two walls that form the real corner (or the real run)
 *  agree, and the odd one out butts. Without the reciprocity test the odd wall
 *  mitres against an arbitrary partner that is NOT mitring back, and the two cuts
 *  disagree: a wedge of overlap on one side and a gap on the other. */
function wallEndJunction(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): { mutual: WallSpec[]; through: WallSpec | null; partner: WallSpec | null } {
  const point = atStart ? wall.start : wall.end
  const mutual: WallSpec[] = []
  let through: WallSpec | null = null
  for (const other of allWalls) {
    if (other.id === wall.id) continue
    if (!endpointOnCentreline(other, point)) continue
    const ends =
      Math.hypot(other.start[0] - point[0], other.start[1] - point[1]) < CORNER_EPS ||
      Math.hypot(other.end[0] - point[0], other.end[1] - point[1]) < CORNER_EPS
    if (ends) mutual.push(other)
    else if (!through) through = other
  }
  return { mutual, through, partner: through ? null : mitrePartner(wall, mutual, allWalls, point) }
}

/** The neighbour `wall` would mitre with at a junction, before reciprocity: the
 *  LONGEST mutual neighbour that turns to a different axis (ties broken by id), or
 *  null when any mutual neighbour is collinear (a straight run, which continues). */
function preferredMitrePartner(
  wall: WallSpec,
  mutual: readonly WallSpec[],
  point: readonly [number, number],
): WallSpec | null {
  const runs = mutual.filter((o) => !isColumnStub(o))
  if (runs.some((o) => isStraightContinuation(wall, o, point))) return null
  let best: WallSpec | null = null
  let bestLen = -1
  for (const o of runs) {
    if (wallsCollinear(wall, o)) continue
    const len = Math.hypot(o.end[0] - o.start[0], o.end[1] - o.start[1])
    if (len > bestLen + 1e-9 || (best && Math.abs(len - bestLen) <= 1e-9 && o.id < best.id)) {
      best = o
      bestLen = Math.max(bestLen, len)
    }
  }
  return best
}

/** `preferredMitrePartner`, kept only when the partner prefers `wall` back. */
function mitrePartner(
  wall: WallSpec,
  mutual: readonly WallSpec[],
  allWalls: readonly WallSpec[],
  point: readonly [number, number],
): WallSpec | null {
  const pref = preferredMitrePartner(wall, mutual, point)
  if (!pref) return null
  const back = wallEndMutual(pref, allWalls, point)
  return preferredMitrePartner(pref, back, point)?.id === wall.id ? pref : null
}

/** The walls that also END at `point`, from `wall`'s point of view. */
function wallEndMutual(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  point: readonly [number, number],
): WallSpec[] {
  const out: WallSpec[] = []
  for (const other of allWalls) {
    if (other.id === wall.id) continue
    if (!endpointOnCentreline(other, point)) continue
    if (
      Math.hypot(other.start[0] - point[0], other.start[1] - point[1]) < CORNER_EPS ||
      Math.hypot(other.end[0] - point[0], other.end[1] - point[1]) < CORNER_EPS
    ) {
      out.push(other)
    }
  }
  return out
}

/** Does `point` lie on `other`'s centre-line span? */
function endpointOnCentreline(other: WallSpec, point: readonly [number, number]): boolean {
  const dx = other.end[0] - other.start[0]
  const dz = other.end[1] - other.start[1]
  const len = Math.hypot(dx, dz)
  if (len === 0) return false
  const tx = dx / len
  const tz = dz / len
  const px = point[0] - other.start[0]
  const pz = point[1] - other.start[1]
  const along = px * tx + pz * tz
  const perp = Math.abs(px * -tz + pz * tx)
  return perp < 1e-3 && along > -1e-3 && along < len + 1e-3
}

/** The neighbour this wall's start/end MITRES with, or null (T-junction, straight
 *  split, free end, or a multi-way junction where the preference is not mutual). */
export function wallMitrePartner(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): WallSpec | null {
  return wallEndJunction(wall, allWalls, atStart).partner
}

export function wallCornerJoin(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
  /** WALL-MITRE-JOINTS. Off, the legacy single-neighbour classification runs (the
   *  first wall whose centre-line touches this endpoint decides), so the A/B arm is
   *  the pre-v0.35.4.0 geometry exactly. */
  mitreJoints = true,
): CornerJoin {
  if (!mitreJoints) return legacyCornerJoin(wall, allWalls, atStart)
  const j = wallEndJunction(wall, allWalls, atStart)
  if (j.through) {
    // A plain T: this end lands mid-span of a through wall. Retract to its near
    // face (buried by `OPENING_CLEARANCE`).
    return { kind: 'butt', abut: -(wallThicknessMetres(j.through) / 2 - OPENING_CLEARANCE) }
  }
  if (j.mutual.length === 0) return { kind: 'free', abut: 0 }
  if (j.partner) return { kind: 'miter', abut: wallThicknessMetres(j.partner) / 2 }
  const point = atStart ? wall.start : wall.end
  if (j.mutual.some((o) => !isColumnStub(o) && isStraightContinuation(wall, o, point))) {
    // Collinear mutual end: the two segments were authored to meet exactly (e.g.
    // the pier's east face IS `wall-ext-N-east`'s declared start), so there is zero
    // gap to fill — no extension, no shear. This is the THROUGH run of a multi-way
    // junction, and it is what stays continuous.
    return { kind: 'butt', abut: 0 }
  }
  // A multi-way junction with no mutual partner: butt back to the NEAREST face at
  // the junction (the smallest half-thickness). Retracting to the largest would
  // open a gap over the thinner neighbour, which is the one defect a bury cannot
  // be traded for — the surplus bury is invisible and the depth pre-pass already
  // makes it composite once.
  const minHalf = Math.min(...j.mutual.map((o) => wallThicknessMetres(o) / 2))
  return { kind: 'butt', abut: -(minHalf - OPENING_CLEARANCE) }
}

/** The pre-WALL-MITRE-JOINTS classification, kept verbatim for the flag's off arm:
 *  it looks at ONE neighbour (the first whose centre-line touches this endpoint) and
 *  so mis-reads every junction where three ends meet. */
function legacyCornerJoin(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): CornerJoin {
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return { kind: 'free', abut: 0 }
  const point = atStart ? wall.start : wall.end
  const nearPt = (p: readonly [number, number]) =>
    Math.hypot(p[0] - point[0], p[1] - point[1]) < CORNER_EPS
  const mutual = nearPt(other.start) || nearPt(other.end)
  if (mutual && !wallsCollinear(wall, other)) {
    return { kind: 'miter', abut: wallThicknessMetres(other) / 2 }
  }
  if (mutual) return { kind: 'butt', abut: 0 }
  return { kind: 'butt', abut: wallCornerAbut(wall, allWalls, atStart) }
}

/** Sign of the wall's LOCAL +Z (its `[0,-angle,0]`-rotated thickness axis) that
 *  points toward the given world-space OUTWARD normal — i.e. which thickness cap
 *  is the building exterior. Drives the mitre's diagonal direction (the exterior
 *  edge is the long side). `+1` when local +Z faces outward, else `−1`. */
export function localOuterZSign(dx: number, dz: number, outNx: number, outNz: number): number {
  const len = Math.hypot(dx, dz) || 1
  // local +Z in world = (-dz, dx)/len (see WallSegment's [0,-angle,0] rotation).
  const dot = outNx * (-dz / len) + outNz * (dx / len)
  return dot >= 0 ? 1 : -1
}

/** This wall's outward (away-from-interior) unit normal, found by probing which
 *  side of its midpoint is inside a room. Returns null when neither/both sides are
 *  interior (an ambiguous interior partition) — the caller then avoids mitring. */
function wallOutwardNormal(
  wall: WallSpec,
  isInterior: (x: number, z: number) => boolean,
): { nx: number; nz: number } | null {
  const mx = (wall.start[0] + wall.end[0]) / 2
  const mz = (wall.start[1] + wall.end[1]) / 2
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz) || 1
  const probe = wallThicknessMetres(wall) / 2 + 0.3
  return orientOutward(mx, mz, -dz / len, dx / len, isInterior, probe)
}

export interface CornerMiter {
  /** Along-axis extension of the outline at this end (metres). */
  abut: number
  /** Signed mitre slope `s` for `a = ±halfLen + s·z`, or null to NOT mitre (butt /
   *  free / ambiguous) — then `abut` is the buried span/butt extension. */
  slope: number | null
}

/**
 * Resolve how this wall's start/end should be built: a proper mitre (with the
 * exact diagonal slope) at a true L-corner, else a buried butt.
 *
 * The mitre seam runs from the corner's EXTERIOR∩EXTERIOR vertex to its
 * INTERIOR∩INTERIOR vertex. In this wall's local frame that line is
 * `a = ±halfLen + slope·z` with
 *
 *     slope = sign(neighbourOutward · thisAxis) · thisOuterZSign · (tNeighbour / tThis)
 *
 * The `sign(neighbourOutward · thisAxis)` term picks which along-axis side the
 * neighbour's exterior lies on, so the diagonal points the right way at BOTH
 * convex and concave (inward-pointing) corners; the `tNeighbour/tThis` ratio makes
 * two DIFFERENT-thickness walls cut to the SAME world diagonal (no gap, no
 * overlap). `abut` = tNeighbour/2 (the long side reaches the outer corner).
 * Ambiguous (no defined outward normal) or non-corner joins fall back to butt.
 */
/**
 * WALL-MITRE-JOINTS: the mitre line at an L-corner, derived from GEOMETRY ALONE —
 * no interior/exterior probe.
 *
 * A corner between two strips has an intrinsically CONVEX side (where the two
 * outer faces meet far from the shared centre-line point) and an intrinsically
 * CONCAVE side (where the two inner faces meet near it). Which side is the
 * building's exterior is irrelevant: the mitre seam is the segment joining those
 * two vertices, and both walls derive the SAME world-space line from it, so the
 * two end-faces are exactly coincident — zero overlap volume, zero gap.
 *
 * In this wall's local frame (X along its axis, Z = `(-dz, dx)/len`) that line
 * passes through the centre-line corner `(±length/2, 0)` and has slope
 *
 *     slope = (tThis · bx + σ · tNeighbour) / (tThis · bz),   σ = +1 at START, −1 at END
 *
 * where `(bx, bz)` are the local components of the unit vector pointing from the
 * corner INTO the neighbour's body. The `tNeighbour` term is the mitre proper (it
 * carries any thickness mismatch, e.g. 100 mm internal into 200 mm external); the
 * `bx` term handles a NON-90° corner. Returns null for a degenerate (collinear)
 * pair, where `bz → 0` and no mitre is defined.
 *
 * This supersedes the probe-derived slope below, which returned null — and so fell
 * back to a buried butt, one box running through the other — whenever the NEIGHBOUR
 * was an interior partition with rooms on both sides. That is every corner of the
 * bath/service-yard/household-shelter core: 13 of the default flat's 43 joins.
 */
export function geometricCornerMiter(
  wall: WallSpec,
  other: WallSpec,
  atStart: boolean,
): CornerMiter | null {
  const point = atStart ? wall.start : wall.end
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return null
  // Direction from the shared corner INTO the neighbour's body: the neighbour ends
  // here, so that is its FAR endpoint.
  const d0 = Math.hypot(other.start[0] - point[0], other.start[1] - point[1])
  const d1 = Math.hypot(other.end[0] - point[0], other.end[1] - point[1])
  const far = d0 >= d1 ? other.start : other.end
  const bxW = far[0] - point[0]
  const bzW = far[1] - point[1]
  const blen = Math.hypot(bxW, bzW)
  if (blen < 1e-9) return null
  // Local frame: +X along the wall axis, +Z = (-dz, dx)/len (the `[0,-angle,0]`
  // rotation `WallSegment` applies).
  const bx = (bxW * dx + bzW * dz) / (blen * len)
  const bz = (bxW * -dz + bzW * dx) / (blen * len)
  if (Math.abs(bz) < 1e-6) return null // collinear: no corner, no mitre
  const tThis = wallThicknessMetres(wall)
  const tNb = wallThicknessMetres(other)
  const sigma = atStart ? 1 : -1
  const slope = (tThis * bx + sigma * tNb) / (tThis * bz)
  // The outline must reach the CONVEX vertex before `applyMiter` clamps it back to
  // the diagonal: that vertex sits |slope|·tThis/2 past the centre-line corner.
  return { abut: Math.abs(slope) * (tThis / 2), slope }
}

export function wallCornerMiter(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
  thisOuterZSign: number,
  isInterior: (x: number, z: number) => boolean,
  /** WALL-MITRE-JOINTS (`wallMitreJoints` flag). On, every true L-corner mitres off
   *  pure geometry. Off, the legacy probe path runs and an ambiguous interior corner
   *  falls back to the buried butt. */
  mitreJoints = true,
): CornerMiter {
  const join = wallCornerJoin(wall, allWalls, atStart, mitreJoints)
  if (join.kind !== 'miter') return { abut: join.abut, slope: null }
  // The MITRE PARTNER, not merely the first wall whose centre-line passes through
  // this endpoint: at a multi-way junction those differ, and cutting to the wrong
  // neighbour's diagonal is exactly the wedge-and-gap the mitre exists to remove.
  const other =
    wallMitrePartner(wall, allWalls, atStart) ?? wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return { abut: join.abut, slope: null }
  if (mitreJoints) {
    const g = geometricCornerMiter(wall, other, atStart)
    if (g) return g
  }
  const nb = wallOutwardNormal(other, isInterior)
  // Ambiguous neighbour (interior partition) → safe buried butt instead of a
  // mis-oriented mitre.
  if (!nb) return { abut: wallCornerAbut(wall, allWalls, atStart), slope: null }
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz) || 1
  const eB = nb.nx * (dx / len) + nb.nz * (dz / len) >= 0 ? 1 : -1
  const tThis = wallThicknessMetres(wall)
  const tNb = wallThicknessMetres(other)
  const slope = (eB * thisOuterZSign * tNb) / tThis
  return { abut: join.abut, slope }
}
