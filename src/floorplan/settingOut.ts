/**
 * Setting-out & datum dimensioning (TODO G3) — pure core.
 *
 * A contractor does not build from cumulative wall-to-wall dimensions (each
 * error compounds down the chain) — they build from a "setting-out plan":
 * every partition FACE dimensioned as a running distance FROM ONE FIXED DATUM
 * (a structural/external wall corner), per
 * `docs/research/2026-07-18-contractor-handover-research.md`. This module
 * derives that datum + those running distances from the editable plan model.
 *
 * **Datum (v1 scope):** `plan.datum` is reserved on the schema for a future
 * user-placed override, but this pass ships the SG-practical default only —
 * the plan's min-x/min-z EXTERNAL wall corner (`datumPoint`) — and
 * deliberately skips adding editor UI to relocate it. A user-movable datum
 * needs its own placement affordance (drag a marker, validate it stays near
 * the building) that's a separate, larger surface; the computed corner is
 * already the answer every SG setting-out plan uses in practice (the
 * structural corner), so shipping it now is honest and useful without that
 * extra surface.
 *
 * **Face, not centreline:** walls are centreline-modeled (`PlanWall.start`/
 * `end`), but the number a contractor marks on the slab is the wall's FACE.
 * Each axis-aligned wall's centreline coordinate is offset by half its
 * resolved thickness (`planGeometry.ts:planWallThickness` — the ONE thickness
 * resolver, reused rather than re-deriving 0.2/0.1 defaults here) TOWARD the
 * datum side — i.e. the face nearer the datum, since that's the face a tape
 * measured from the datum actually reaches first. A wall exactly astride the
 * datum's own coordinate (the datum-forming wall itself) breaks the tie
 * consistently toward the lower coordinate.
 *
 * **Running, not cumulative:** each face's distance is measured directly from
 * the datum (`projectToBaseline` — signed, arbitrary origin), never chained
 * wall-to-wall — this is the compounding-error fix the research calls out.
 * `dimensionChain.ts`'s `runningDimensions` anchors at the SMALLEST input
 * position instead of an arbitrary origin, which only coincides with the true
 * datum when nothing lies on its near side; because a datum-forming wall's own
 * face can land fractionally before the datum (the tie-break above), this
 * module computes each face's signed distance directly rather than reusing
 * `runningDimensions` — `projectToBaseline` is the piece it DOES reuse.
 *
 * Curved (`arc`) walls have no simple planar face and are skipped; only walls
 * parallel to the X or Z axis contribute (a diagonal wall has no single
 * "face" along either baseline).
 *
 * Self-contained beyond `./types` + `./planGeometry` (the shared thickness
 * resolver) + `./dimensionChain` (`projectToBaseline`) + `./roomCentroid`
 * (tile setting-out point). No three/React imports.
 */
import { projectToBaseline } from './dimensionChain'
import { planWallThickness } from './planGeometry'
import { roomLabelPoint } from './roomCentroid'
import type { FloorPlan, PlanRoom, PlanVec2, PlanWall } from './types'
import { pointInRoom, roomPolygon } from './types'

const EPS = 1e-6

/** One face position dimensioned as a running distance from the datum. */
export interface SettingOutFace {
  /** Signed distance from the datum along this row's axis (metres). */
  distance: number
  /** World point of the dimensioned face (for rendering — the other axis is
   *  the wall's midpoint, purely for label/leader placement). */
  point: PlanVec2
  /** Source wall id, so a renderer/caller can cross-reference. */
  wallId: string
}

/**
 * A wall the running rows cannot express — diagonal or curved — set out the way
 * practice actually handles non-orthogonal geometry: by CO-ORDINATES. Each
 * endpoint is given as an X and Z offset from the same datum the running rows
 * use, plus the wall's angle, so a contractor can set it out with a tape from
 * two known dimensions rather than guessing off a scaled drawing.
 *
 * The running rows dimension a wall's FACE (what a tape reaches first); a skew
 * wall is dimensioned on its CENTRELINE endpoints instead, because a sloping
 * face has no single offset and the centreline is what the geometry model
 * actually stores. `radiusM` is present only for an arc wall.
 */
interface SettingOutSkewWall {
  wallId: string
  /** Start endpoint, as {x, z} offsets from the datum (metres). */
  start: PlanVec2
  /** End endpoint, as {x, z} offsets from the datum (metres). */
  end: PlanVec2
  /** Angle from the +X axis, degrees in [0, 180) — a wall and its reverse read
   *  the same, which is what a setting-out note wants. */
  angleDeg: number
  /** Arc radius (metres) when the wall is curved; absent for a straight skew
   *  wall. Derived from the chord and the stored arc bulge. */
  radiusM?: number
}

/** Setting-out dimension set for one storey: the datum + its two running rows
 *  (X-axis faces from vertical walls, Z-axis faces from horizontal walls),
 *  each sorted ascending and deduped — plus any wall those rows cannot express,
 *  set out by co-ordinates instead so nothing is silently left undimensioned. */
export interface SettingOutSet {
  datum: PlanVec2
  x: SettingOutFace[]
  z: SettingOutFace[]
  /** Diagonal / curved walls, set out by endpoint co-ordinates. Sorted by
   *  wall id so the rendered table is deterministic. */
  skew: SettingOutSkewWall[]
}

/** Walls for the given storey: `plan.walls` (ground, `levelId` absent) or the
 *  matching `upperLevels` entry's own walls. Mirrors the shape every other
 *  pure floor-plan builder in this file takes (a caller resolves the storey,
 *  e.g. via `levels.ts:levelAsPlan`, and normally passes the ground-shaped
 *  plan directly) while still giving THIS module direct level filtering, per
 *  the TODO G3 spec, with no import back into `levels.ts` (avoids a cycle and
 *  keeps this file dependency-light). */
function levelWalls(plan: FloorPlan, levelId?: string): PlanWall[] {
  if (!levelId) return Array.isArray(plan.walls) ? plan.walls : []
  const level = plan.upperLevels?.find((l) => l.id === levelId)
  return level ? level.walls : []
}

function levelRooms(plan: FloorPlan, levelId?: string): PlanRoom[] {
  if (!levelId) return Array.isArray(plan.rooms) ? plan.rooms : []
  const level = plan.upperLevels?.find((l) => l.id === levelId)
  return level ? level.rooms : []
}

/**
 * The setting-out datum for a storey: `plan.datum` when the user has set one
 * (reserved for a future placement UI — see the file header; unused by any
 * editor in this pass), else the min-x/min-z corner among that storey's
 * EXTERNAL wall vertices (falls back to ALL walls if there are no external
 * walls, then to `[0, 0]` for a wall-less/degenerate plan). The explicit
 * override is ground-only (there is no per-storey datum concept yet) — an
 * upper-storey `levelId` always computes its own corner.
 */
export function datumPoint(plan: FloorPlan, levelId?: string): PlanVec2 {
  if (!levelId && plan.datum && Number.isFinite(plan.datum.x) && Number.isFinite(plan.datum.z)) {
    return [plan.datum.x, plan.datum.z]
  }
  const walls = levelWalls(plan, levelId)
  const external = walls.filter((w) => w.thickness === 'external')
  const pool = external.length > 0 ? external : walls
  if (pool.length === 0) return [0, 0]
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  for (const w of pool) {
    for (const p of [w.start, w.end]) {
      if (p[0] < minX) minX = p[0]
      if (p[1] < minZ) minZ = p[1]
    }
  }
  return [minX, minZ]
}

/** The near-datum face coordinate: `centre` offset by `half` thickness toward
 *  `datumCoord` (the face a tape from the datum reaches first). Ties
 *  (`centre === datumCoord`, the datum-forming wall itself) break toward the
 *  lower coordinate for a deterministic result. */
function nearFaceCoord(centre: number, half: number, datumCoord: number): number {
  if (half <= 0) return centre
  const sign = centre - datumCoord < 0 ? 1 : -1
  return centre + sign * half
}

/** Sort ascending by distance and drop positions within `EPS` of the previous
 *  one (coincident faces — e.g. two partitions meeting flush). */
function dedupeSort(faces: SettingOutFace[]): SettingOutFace[] {
  const sorted = [...faces].sort((a, b) => a.distance - b.distance)
  const out: SettingOutFace[] = []
  for (const f of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(f.distance - last.distance) <= EPS) continue
    out.push(f)
  }
  return out
}

/**
 * Build the setting-out dimension set for a storey: from the datum, every
 * axis-aligned wall's near face, as a running (not cumulative) distance.
 * Robust to missing/degenerate input (no walls → empty rows at datum `[0,0]`).
 */
export function settingOutDimensions(plan: FloorPlan, levelId?: string): SettingOutSet {
  const walls = levelWalls(plan, levelId)
  const datum = datumPoint(plan, levelId)
  const xFaces: SettingOutFace[] = []
  const zFaces: SettingOutFace[] = []
  const skew: SettingOutSkewWall[] = []

  /** Record a wall the running rows can't express, as datum-relative
   *  endpoint co-ordinates + its angle (+ radius when curved). */
  const pushSkew = (w: PlanWall, arc: number) => {
    const [sx, sz] = w.start
    const [ex, ez] = w.end
    const chord = Math.hypot(ex - sx, ez - sz)
    // Normalise the angle to [0, 180): a wall and its reverse are the same line.
    let angleDeg = (Math.atan2(ez - sz, ex - sx) * 180) / Math.PI
    if (angleDeg < 0) angleDeg += 180
    if (angleDeg >= 180) angleDeg -= 180
    // `arc` is the bulge (sagitta) in metres; R = (c/2)^2 / (2h) + h/2.
    const h = Math.abs(arc)
    const radiusM = h > EPS && chord > EPS ? (chord / 2) ** 2 / (2 * h) + h / 2 : undefined
    skew.push({
      wallId: w.id,
      start: [sx - datum[0], sz - datum[1]],
      end: [ex - datum[0], ez - datum[1]],
      angleDeg: Math.round(angleDeg * 10) / 10,
      ...(radiusM === undefined ? {} : { radiusM }),
    })
  }

  for (const w of walls) {
    const arc = w.arc ?? 0
    if (Math.abs(arc) > EPS) {
      // A curved wall has no planar face — set it out by chord + radius.
      pushSkew(w, arc)
      continue
    }
    const [sx, sz] = w.start
    const [ex, ez] = w.end
    const dx = ex - sx
    const dz = ez - sz
    const half = planWallThickness(w, plan) / 2

    if (Math.abs(dz) < EPS && Math.abs(dx) > EPS) {
      // Horizontal wall (parallel to X) → one face position along Z.
      const faceZ = nearFaceCoord(sz, half, datum[1])
      zFaces.push({
        distance: projectToBaseline([0, faceZ], [0, datum[1]], [0, 1]),
        point: [(sx + ex) / 2, faceZ],
        wallId: w.id,
      })
    } else if (Math.abs(dx) < EPS && Math.abs(dz) > EPS) {
      // Vertical wall (parallel to Z) → one face position along X.
      const faceX = nearFaceCoord(sx, half, datum[0])
      xFaces.push({
        distance: projectToBaseline([faceX, 0], [datum[0], 0], [1, 0]),
        point: [faceX, (sz + ez) / 2],
        wallId: w.id,
      })
    } else if (Math.abs(dx) > EPS && Math.abs(dz) > EPS) {
      // A diagonal wall has no single axis-aligned face — co-ordinates instead.
      pushSkew(w, 0)
    }
    // A zero-length wall falls through: nothing to set out.
  }

  return {
    datum,
    x: dedupeSort(xFaces),
    z: dedupeSort(zFaces),
    skew: skew.sort((a, b) => a.wallId.localeCompare(b.wallId)),
  }
}

/** One room's tile setting-out start point (v1: near the room centroid — the
 *  common convention — via the shared `roomLabelPoint`, so this stays in
 *  lockstep with wherever else a room's representative point is used). */
export interface TileSettingOutPoint {
  roomId: string
  point: PlanVec2
}

/** How far (metres) the tile mark is offset SOUTH (+z) of the room's raw
 *  centroid — `reportPlanSvg.ts` draws the room's name+area label block
 *  centred on that same centroid (H-D2 defect: the mark used to sit directly
 *  under/over that text), so the mark is pushed clear of it while staying
 *  "centroid-ish" per the setting-out convention. */
const TILE_MARK_OFFSET_Z = 0.5
/** East/West fallback offset (metres) — tried when the south offset clamps
 *  back onto the label in a room too SHALLOW (north-south) for 0.5m of
 *  clearance, e.g. an ~0.85m-deep AC ledge (re-review follow-up to H-D2). */
const TILE_MARK_OFFSET_X = 0.5
/** Keep the offset mark at least this far inside the room's bounding edges —
 *  a small margin so the cross + its arms never touch a wall. */
const TILE_MARK_MARGIN = 0.15
/** A clamped candidate within this many metres of the label point ON THE Z
 *  AXIS is considered "still overlapping the label block" and rejected —
 *  roughly the two-line name+area label's half-height at the sheet's print
 *  scale (`reportPlanSvg.ts`'s room label, ~0.32-unit font, two `tspan`
 *  rows straddling the centroid). */
const TILE_MARK_EXCLUSION_Z_M = 0.35
/** Per-character horizontal exclusion (metres) approximating the room-NAME
 *  line's rendered half-width (`text-anchor="middle"`, so it extends this
 *  much either side of the centroid) — the label block isn't a small dot,
 *  it's as wide as the room's own name, so a small room with an ordinary-
 *  length name (e.g. "AC Ledge") can't just be shifted a fixed amount east/
 *  west and call it clear; the exclusion has to scale with the actual text. */
const TILE_MARK_EXCLUSION_X_PER_CHAR_M = 0.09

/** The label block's approximate half-width on the X axis for `name` — floored
 *  at `TILE_MARK_EXCLUSION_Z_M` so even a very short/empty name still demands
 *  some real horizontal clearance. */
function labelHalfWidth(name: string): number {
  return Math.max(TILE_MARK_EXCLUSION_Z_M, name.length * TILE_MARK_EXCLUSION_X_PER_CHAR_M)
}

/** One candidate tile-mark position: the room's raw centroid offset along one
 *  axis by `offset` (south/east/west), clamped to stay `TILE_MARK_MARGIN`
 *  inside the room's bounding edges on that axis, then polygon-containment
 *  checked (non-rectangular rooms). Returns `null` when even the clamped
 *  point falls outside the room (too small/oddly-shaped for this offset). */
function clampedOffsetCandidate(r: PlanRoom, axis: 'x' | 'z', offset: number): PlanVec2 | null {
  const [cx, cz] = roomLabelPoint(r)
  const poly = roomPolygon(r)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const [x, z] of poly) {
    const v = axis === 'x' ? x : z
    if (v < min) min = v
    if (v > max) max = v
  }
  const base = axis === 'x' ? cx : cz
  let v = base + offset
  v = Math.min(v, max - TILE_MARK_MARGIN)
  v = Math.max(v, min + TILE_MARK_MARGIN)
  const point: PlanVec2 = axis === 'x' ? [v, cz] : [cx, v]
  return pointInRoom(r, point[0], point[1]) ? point : null
}

/**
 * A room's tile setting-out start point: the raw centroid offset SOUTH by
 * `TILE_MARK_OFFSET_Z`, clamped to stay inside the room. When that clamped
 * point still lands within the room's LABEL BLOCK — an axis-aligned box
 * around the centroid, `labelHalfWidth(r.name)` wide (the name text's own
 * rendered half-width) and `TILE_MARK_EXCLUSION_Z_M` tall (a room too
 * SHALLOW north-south for the full south offset to clear it — e.g. an
 * ~0.85m-deep AC ledge — clamps the mark back onto the label block,
 * re-review follow-up to H-D2) — falls back to an EAST then a WEST offset
 * candidate with the same clamp+exclusion check. Returns `null` (mark
 * omitted for this room) when every candidate still lands within the label
 * block — a room too small in every direction (both shallow AND narrow
 * relative to its own name) for ANY offset to clear the label; the caller
 * notes the omission once in the sheet caption rather than drawing a mark
 * back on top of the text.
 */
function tileMarkPoint(r: PlanRoom): PlanVec2 | null {
  const [cx, cz] = roomLabelPoint(r)
  const halfW = labelHalfWidth(r.name)
  // Clear of the label block once EITHER axis distance exceeds that axis's
  // half-extent — a rectangle test, not a radius, since the label is as wide
  // as its own name (a small room with a long name needs more X clearance
  // than a small room with a short one).
  const clearsLabel = (p: PlanVec2) =>
    Math.abs(p[0] - cx) >= halfW || Math.abs(p[1] - cz) >= TILE_MARK_EXCLUSION_Z_M
  const candidates = [
    clampedOffsetCandidate(r, 'z', TILE_MARK_OFFSET_Z),
    clampedOffsetCandidate(r, 'x', TILE_MARK_OFFSET_X),
    clampedOffsetCandidate(r, 'x', -TILE_MARK_OFFSET_X),
  ]
  for (const c of candidates) {
    if (c && clearsLabel(c)) return c
  }
  return null
}

/**
 * Tile setting-out start points: one per room on the storey (rooms too small
 * in every direction for the mark to clear the room's own label are omitted
 * — see `tileMarkPoint`), offset below/beside the room's name/area label
 * block — "start laying here, verify joints on site". Every room in this
 * model always resolves to SOME floor finish (`roomFinishes.ts:
 * resolvePlanRoomFloor` falls back to a default oak when nothing's been
 * picked), so there is no real "has no floor" state to filter on here — the
 * caller (the drawing set) is what decides whether this content is relevant,
 * by only drawing it alongside the finishes schedule sheet. Deliberately
 * v1-modest: no grid, no joint direction — a start-point cross + note is the
 * honest minimum this data model supports (there is no tile size/pattern
 * stored anywhere to derive a real grid from).
 */
export function tileSettingOutPoints(plan: FloorPlan, levelId?: string): TileSettingOutPoint[] {
  const out: TileSettingOutPoint[] = []
  for (const r of levelRooms(plan, levelId)) {
    const point = tileMarkPoint(r)
    if (point) out.push({ roomId: r.id, point })
  }
  return out
}

/** True when at least one room on the storey had its tile mark OMITTED
 *  (`tileMarkPoint` returned null) — the caller uses this to add the
 *  "marks omitted for small utility rooms" note to the shared caption
 *  exactly once, only when it's actually true for this storey. */
export function anyTileMarksOmitted(plan: FloorPlan, levelId?: string): boolean {
  const rooms = levelRooms(plan, levelId)
  const marked = tileSettingOutPoints(plan, levelId).length
  return marked < rooms.length
}
