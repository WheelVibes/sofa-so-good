/**
 * WALL tile setting-out / coursing — pure data core.
 *
 * The sibling of `tileCoursing.ts` (floors), and NOT a re-run of it on walls:
 * the conventions genuinely differ, and getting them wrong is visible at eye
 * level rather than underfoot. Sourced rather than assumed
 * (`docs/research/2026-09-03-wall-tile-setting-out.md`):
 *
 * **Horizontal — centred, with edge cuts of at least HALF a tile.** Trade
 * practice is to find the wall's vertical centre and work outward so both end
 * cuts are equal, adjusting the centre line if one side would give a cut under
 * half a tile ("edge tiles are always at least half the width of a whole
 * tile"). This is the load-bearing difference from the floor model, which
 * accepts down to a QUARTER module: a floor cut sits under furniture, a wall cut
 * sits in your eyeline.
 *
 * Note the arithmetic consequence, which is why the rule reads as always
 * applying: with a centred field `cut = leftover / 2` and `leftover < module`,
 * so the naive cut is ALWAYS under half a tile. Shifting the field by half a
 * module (putting a joint on centre instead of a tile centre) gives
 * `cut = (leftover + module) / 2`, which always lands in `(module/2, module)`.
 * So a correctly set-out wall run always ends on a cut between a half tile and a
 * full one — exactly what the sources prescribe, and it means the "sliver"
 * concept that is near-unreachable for floors (see `tileCoursing.ts`'s header)
 * cannot arise horizontally here at all.
 *
 * **Vertical — full course at the TOP, cut course at the BOTTOM.** Set out from
 * the ceiling downward: "you always look at the top, rarely the bottom", and
 * setting out from the lowest point instead leaves small cuts against the
 * ceiling where they are most obvious. The bottom cut is reported and flagged
 * when it falls under half a course, since a sliver above the skirting/floor
 * junction is still poor work — but it is a FLAG, not an adjustment, because the
 * fix is a decision (drop the tiled height, change module, accept it) rather
 * than arithmetic.
 *
 * **Openings are reported, not modelled into the field.** A door or window
 * interrupts a face, but a tiler still strikes the datum and centre lines over
 * the whole run and cuts around the opening — so the field is set out over the
 * full face and the opening count travels with the row as a verify-on-site note.
 * Modelling a genuinely opening-aware field (which changes where a balanced
 * centre sits) is a larger job and is deliberately not faked here.
 *
 * Reads the SPECIFIED module only (`MaterialDef.moduleMm`), never derived from
 * `uvScale` — same rule and same reason as the floor core. A finish with no
 * specified module yields no row, and the caller reports how many faces were
 * omitted rather than implying the schedule is complete.
 *
 * Pure (no store, no three, no DOM).
 */

import type { MaterialDef } from '../materials/types'
import { assignRoomWallNames } from './roomWallNames'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'
import { wallLength } from './types'

/** A wall edge cut narrower than this fraction of the module is unacceptable —
 *  trade practice is "at least half a tile" at an edge. Deliberately DIFFERENT
 *  from the floor core's quarter-module bar. */
export const WALL_EDGE_MIN_FRACTION = 0.5

/** Setting-out for one tiled wall face. All lengths in millimetres. */
export interface WallTileCoursing {
  wallId: string
  /** `<room> wall NN`, from the shared allocator so this agrees with the
   *  elevations sheet's captions rather than inventing a second numbering. */
  wallName: string
  roomId: string
  roomName: string
  materialId: string
  materialName: string
  /** Specified module `[width, height]` (mm). */
  moduleMm: [number, number]
  /** Face run along the wall (mm) and tiled height (mm). */
  faceMm: [number, number]
  /** Whole tiles across the run, excluding the two end cuts. */
  fullTilesAcross: number
  /** Equal end cut at each end of the run (mm) — always ≥ half a module, or 0
   *  when the run divides exactly into whole tiles. */
  endCutMm: number
  /** Offset from the wall's START to the first full tile's near edge (mm).
   *  Equals `endCutMm`; named separately because that is what a tiler marks. */
  setOutFromStartMm: number
  /** Whole courses counted DOWN from the top. */
  fullCourses: number
  /** Height of the single cut course at the bottom (mm); 0 when the height
   *  divides exactly. */
  bottomCutMm: number
  /** True when the bottom cut course is under half a course — a decision for
   *  the designer, not something this corrects. */
  bottomSliver: boolean
  /** Openings on this wall (doors/windows) the field is cut around. */
  openings: number
  /** Estimated tile count including part tiles, excluding wastage. */
  tileCount: number
}

/**
 * Horizontal field for one axis: a centred run whose two end cuts are equal and
 * never under half a module.
 */
function acrossRun(runMm: number, moduleMm: number): { full: number; cut: number } {
  const full = Math.floor(runMm / moduleMm)
  const leftover = runMm - full * moduleMm
  // Exact fit (within a millimetre) — whole tiles, no cut.
  if (leftover < 1) return { full, cut: 0 }
  const naive = leftover / 2
  if (naive >= moduleMm * WALL_EDGE_MIN_FRACTION) return { full, cut: naive }
  // Shift the field by half a module so both end cuts clear the half-tile bar.
  // With `full` already 0 there is no tile to give back, so the run is narrower
  // than one tile and the "cut" is the whole face.
  if (full < 1) return { full: 0, cut: naive }
  return { full: full - 1, cut: (leftover + moduleMm) / 2 }
}

/** Vertical courses, counted from the ceiling down so the top course is full. */
function courses(heightMm: number, moduleMm: number): { full: number; bottomCut: number } {
  const full = Math.floor(heightMm / moduleMm)
  const bottomCut = heightMm - full * moduleMm
  return { full, bottomCut: bottomCut < 1 ? 0 : bottomCut }
}

/** A face whose horizontal course lines step against the rest of its room's. */
export interface CornerCourseStep {
  roomId: string
  roomName: string
  wallId: string
  wallName: string
  /** Vertical offset between this face's joints and the room's majority (mm). */
  stepMm: number
}

/**
 * Setting-out for one wall face, or `null` when it cannot be stated honestly:
 * no finish, a finish with no SPECIFIED module, or a degenerate face.
 */
export function wallFaceTileCoursing(
  wall: PlanWall,
  wallName: string,
  room: PlanRoom,
  material: MaterialDef | undefined,
  tiledHeightM: number,
  openings: number,
): WallTileCoursing | null {
  const moduleMm = material?.moduleMm
  if (!material || !moduleMm) return null
  const [mw, mh] = moduleMm
  if (!(mw > 0) || !(mh > 0)) return null

  const runM = wallLength(wall)
  if (!(runM > 0) || !(tiledHeightM > 0)) return null
  const runMm = runM * 1000
  const heightMm = tiledHeightM * 1000

  const across = acrossRun(runMm, mw)
  const down = courses(heightMm, mh)

  const cols = across.full + (across.cut > 0 ? 2 : 0)
  const rows = down.full + (down.bottomCut > 0 ? 1 : 0)

  return {
    wallId: wall.id,
    wallName,
    roomId: room.id,
    roomName: room.name,
    materialId: material.id,
    materialName: material.name,
    moduleMm: [mw, mh],
    faceMm: [runMm, heightMm],
    fullTilesAcross: across.full,
    endCutMm: across.cut,
    setOutFromStartMm: across.cut,
    fullCourses: down.full,
    bottomCutMm: down.bottomCut,
    bottomSliver: down.bottomCut > 0 && down.bottomCut < mh * WALL_EDGE_MIN_FRACTION,
    openings,
    tileCount: cols * rows,
  }
}

/**
 * Setting-out for every tiled wall face on ONE storey.
 *
 * `plan` must be single-level (the plan itself, or a `levels.ts:levelAsPlan`
 * result) — same contract as every other per-storey builder. Faces are derived
 * from the SHARED room→wall allocator, so a face's name matches the wall
 * elevation sheet for the same wall instead of a second numbering scheme.
 *
 * A wall bordering two rooms yields a face per room, because each side is a
 * separate tiling job with its own finish.
 */
export function planWallTileCoursing(
  plan: FloorPlan,
  wallFinishes: Record<string, string | undefined>,
  materials: Record<string, MaterialDef | undefined>,
): { rows: WallTileCoursing[]; omittedFaces: number; cornerCourseSteps: CornerCourseStep[] } {
  const walls = Array.isArray(plan?.walls) ? plan.walls : []
  const rooms = Array.isArray(plan?.rooms) ? plan.rooms : []
  const openings: PlanOpening[] = Array.isArray(plan?.openings) ? plan.openings : []
  const openingsByWall = new Map<string, number>()
  for (const o of openings) {
    if (!o?.wallId) continue
    openingsByWall.set(o.wallId, (openingsByWall.get(o.wallId) ?? 0) + 1)
  }
  const wallById = new Map(walls.map((w) => [w.id, w]))
  const planCeiling = typeof plan?.ceilingHeight === 'number' ? plan.ceilingHeight : 2.6

  const rows: WallTileCoursing[] = []
  let omittedFaces = 0
  for (const room of rooms) {
    const matId = wallFinishes[room.id]
    const material = matId ? materials[matId] : undefined
    // A wall's tiled height is the room's own ceiling height when set (a dropped
    // wet-room ceiling changes the tiled run), else the plan default. A
    // half-height wall (`topHeight`) tiles only to its own top.
    const roomCeiling = room.ceilingHeight ?? planCeiling
    for (const assigned of assignRoomWallNames(walls, room)) {
      const wall = wallById.get(assigned.id)
      if (!wall) continue
      const tiledHeight = wall.topHeight ?? roomCeiling
      const row = wallFaceTileCoursing(
        wall,
        assigned.name,
        room,
        material,
        tiledHeight,
        openingsByWall.get(wall.id) ?? 0,
      )
      if (row) rows.push(row)
      else omittedFaces += 1
    }
  }
  return { rows, omittedFaces, cornerCourseSteps: cornerCourseSteps(rows) }
}

/**
 * Faces whose horizontal course lines do NOT line up with the rest of their
 * room's, and by how much (mm).
 *
 * **Measured 2026-09-03: this is empty for every tiled room the app ships.**
 * `TODO.md` recorded that "faces are set out independently, so courses do not
 * generally align around a corner", and called fixing it a larger job needing a
 * design decision about which face's balance to sacrifice. That premise is
 * wrong. Courses are struck from the TOP of each face down (`courses()`), and
 * every face of a room shares the room's ceiling height and its single
 * per-room wall finish — so the course grid is identical on all four faces **by
 * construction**. Measured on the shipped flat: Bath/WC 1, Bath/WC 2 and the
 * Kitchen each have all four faces at one `(fullCourses, bottomCut)` pair.
 *
 * What varies per face is the END CUT (175-300 mm across those twelve faces),
 * i.e. the VERTICAL joint positions — and those do not need to continue around
 * a corner, because the two faces meeting there are perpendicular.
 *
 * The one way alignment can break is a face with its own `topHeight` — a shower
 * knee wall — whose tiled height is not congruent to the room's modulo the tile
 * height. Verified both ways: `topHeight` 1.2 m on a 600 mm module still aligns
 * (joints at 600 mm either side), while 1.1 m puts that face's joint at 500 mm
 * against 600 mm on its neighbours — a 100 mm step, exactly
 * `(2400 - 1100) mod 600`. That is what this reports, so the tiler is told
 * rather than left to find it on the wall.
 */
function cornerCourseSteps(rows: WallTileCoursing[]): CornerCourseStep[] {
  const byRoom = new Map<string, WallTileCoursing[]>()
  for (const r of rows) {
    const list = byRoom.get(r.roomId)
    if (list) list.push(r)
    else byRoom.set(r.roomId, [r])
  }
  const out: CornerCourseStep[] = []
  for (const faces of byRoom.values()) {
    if (faces.length < 2) continue
    // Phase = where the course grid sits relative to the face top. Faces with
    // equal phase have joints at the same heights above the floor.
    const phase = (f: WallTileCoursing) => {
      const mh = f.moduleMm[1]
      return mh > 0 ? ((f.faceMm[1] % mh) + mh) % mh : 0
    }
    const counts = new Map<number, number>()
    for (const f of faces) {
      const p = Math.round(phase(f) * 1000) / 1000
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    // The room's majority phase is the reference; ties resolve to the smaller
    // phase so the choice is deterministic rather than insertion-ordered.
    let ref = Number.POSITIVE_INFINITY
    let best = -1
    for (const [p, n] of counts) {
      if (n > best || (n === best && p < ref)) {
        best = n
        ref = p
      }
    }
    for (const f of faces) {
      const mh = f.moduleMm[1]
      const d = Math.abs(phase(f) - ref)
      // A step of a full module is no step at all — the joints coincide.
      const step = Math.min(d, mh - d)
      if (step < 1) continue
      out.push({
        roomId: f.roomId,
        roomName: f.roomName,
        wallId: f.wallId,
        wallName: f.wallName,
        stepMm: step,
      })
    }
  }
  return out
}
