import { FLAT } from './constants'
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
  const cutouts = [...wall.cutouts].sort((a, b) => a.offset - b.offset)
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
export function wallCornerAbut(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
  clearance = OPENING_CLEARANCE,
): number {
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return 0
  const half = wallThicknessMetres(other) / 2
  // Spanner (id wins) extends to fill the corner; butter retracts, buried by ε.
  return wall.id < other.id ? half : -(half - clearance)
}

const CORNER_EPS = 0.02 // m: endpoints within this are "the same corner"

/** How this wall's end joins its neighbour. `miter` = a true L-corner (both walls
 *  END at the shared point) — the walls are cut to the corner's angle-bisector so
 *  each takes half with a seamless (backface-culled) diagonal seam. `butt` = a
 *  T-junction (this end lands mid-span of a through-wall) — the buried span/butt
 *  tiling, whose `abut` buries the end so it neither doubles nor z-fights.
 *  `free` = open end. */
export type CornerJoin =
  | { kind: 'free'; abut: 0 }
  | { kind: 'miter'; abut: number }
  | { kind: 'butt'; abut: number }

/** Classify (and size) how this wall's start/end joins whatever it meets. A true
 *  L-corner mitres (ANY thickness — the slope, computed in `wallCornerMiter`,
 *  carries the thickness ratio); its `abut` extends by the NEIGHBOUR's half-
 *  thickness so the mitre's long side reaches the shared outer corner. */
export function wallCornerJoin(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
): CornerJoin {
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return { kind: 'free', abut: 0 }
  const point = atStart ? wall.start : wall.end
  const nearPt = (p: readonly [number, number]) =>
    Math.hypot(p[0] - point[0], p[1] - point[1]) < CORNER_EPS
  // A true L-corner: the neighbour also ENDS here (mutual), not a T where this
  // end lands mid-span of a through-wall.
  const mutual = nearPt(other.start) || nearPt(other.end)
  if (mutual) {
    // Extend by the NEIGHBOUR's half-thickness so the mitre's long (outer) side
    // reaches the shared outer corner even when the two walls differ in thickness.
    return { kind: 'miter', abut: wallThicknessMetres(other) / 2 }
  }
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
export function wallCornerMiter(
  wall: WallSpec,
  allWalls: readonly WallSpec[],
  atStart: boolean,
  thisOuterZSign: number,
  isInterior: (x: number, z: number) => boolean,
): CornerMiter {
  const join = wallCornerJoin(wall, allWalls, atStart)
  if (join.kind !== 'miter') return { abut: join.abut, slope: null }
  const other = wallEndAbutmentNeighbor(wall, allWalls, atStart)
  if (!other) return { abut: join.abut, slope: null }
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
