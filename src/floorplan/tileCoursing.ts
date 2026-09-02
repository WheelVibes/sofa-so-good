/**
 * Tile setting-out / coursing (G5) — pure data core.
 *
 * A tiling layout drawing is what stops the most common and most expensive
 * category of on-site rework: tiles started from the wrong corner, so the run
 * ends on a 20 mm sliver against the most visible wall. A designer sets out the
 * coursing on paper — origin, full-tile field, and the width of the cut at each
 * perimeter — and the tiler works from that.
 *
 * **Reads the SPECIFIED module only.** `MaterialDef.moduleMm` is a product
 * dimension. It is deliberately NOT derived from `uvScale`: the rendered tile
 * size is `uvScale ÷ the painter's internal grid count` (`patterns/tile.ts`
 * bakes 2×2 tiles per texture period, `brick` 5×6), and those counts are
 * texture-authoring constants that exist to make a map look right. Inferring a
 * construction dimension from them would let a purely visual retune silently
 * change a contractor's setting-out. A finish with no specified module yields
 * `null` — "unknown", never a default size.
 *
 * **Origin convention.** Tiling is set out CENTRED on the room, which is the
 * common residential convention and the one that avoids a sliver on one side:
 * the field is centred so the two opposite cuts are equal and as wide as
 * possible. `SLIVER_LIMIT_MM` flags a cut narrower than a quarter module, the
 * usual threshold at which a tiler is expected to re-set the origin or the
 * designer to accept a deliberate feature.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import type { MaterialDef } from '../materials/types'
import { type FloorPlan, type PlanRoom, planRoomArea, roomPolygon } from './types'

/** A perimeter cut narrower than this fraction of the module reads as a sliver. */
export const SLIVER_LIMIT_FRACTION = 0.25

/** Coursing for one room's floor finish. All lengths in millimetres. */
export interface RoomTileCoursing {
  roomId: string
  roomName: string
  /** The finish this coursing is for. */
  materialId: string
  materialName: string
  /** Specified module `[width, height]` (mm). */
  moduleMm: [number, number]
  /** Room's bounding extent (mm) — the field is set out across this. */
  extentMm: [number, number]
  /** Whole tiles across each axis (excludes the perimeter cuts). */
  fullTiles: [number, number]
  /** Perimeter cut width on each axis (mm) — equal at both ends, because the
   *  field is centred. 0 when the room divides exactly into whole tiles. */
  cutMm: [number, number]
  /** Setting-out origin: offset (mm) from the room's min corner to the first
   *  full tile's near corner. Equals `cutMm` by construction; named separately
   *  because that is what a tiler marks on the slab. */
  originMm: [number, number]
  /** True when either cut is a sliver (< a quarter module) — worth re-setting
   *  the origin or accepting deliberately. */
  sliver: boolean
  /** Estimated tile count including part tiles, for the schedule. Excludes
   *  wastage — a quantity surveyor adds that. */
  tileCount: number
}

/** Room bounding extent in metres, polygon-aware. */
function roomExtentM(room: PlanRoom): [number, number] {
  const poly = roomPolygon(room)
  if (poly && poly.length >= 3) {
    const xs = poly.map((p) => p[0])
    const zs = poly.map((p) => p[1])
    return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]
  }
  return [room.width, room.depth]
}

/**
 * Coursing for one room, or `null` when it cannot be stated honestly: no
 * finish, a finish with no SPECIFIED module, or a degenerate room.
 */
export function roomTileCoursing(
  room: PlanRoom,
  material: MaterialDef | undefined,
): RoomTileCoursing | null {
  const moduleMm = material?.moduleMm
  if (!material || !moduleMm) return null
  const [mw, mh] = moduleMm
  if (!(mw > 0) || !(mh > 0)) return null

  const [wM, dM] = roomExtentM(room)
  if (!(wM > 0) || !(dM > 0)) return null
  const extentMm: [number, number] = [wM * 1000, dM * 1000]

  const axis = (extent: number, mod: number): { full: number; cut: number } => {
    // Centred field: the leftover splits equally between the two ends, so both
    // cuts are the same width and as wide as they can be.
    const full = Math.floor(extent / mod)
    const leftover = extent - full * mod
    if (leftover < 1) return { full, cut: 0 }
    // Give one whole tile back to the cuts when that widens them: a 10 mm
    // leftover split in two is a 5 mm sliver, whereas borrowing a tile makes
    // both cuts (mod + 10) / 2 — the standard re-set a tiler would do.
    const naive = leftover / 2
    if (naive >= mod * SLIVER_LIMIT_FRACTION || full < 1) {
      return { full, cut: naive }
    }
    return { full: full - 1, cut: (leftover + mod) / 2 }
  }

  const x = axis(extentMm[0], mw)
  const z = axis(extentMm[1], mh)
  const cutMm: [number, number] = [x.cut, z.cut]
  const sliver =
    (x.cut > 0 && x.cut < mw * SLIVER_LIMIT_FRACTION) ||
    (z.cut > 0 && z.cut < mh * SLIVER_LIMIT_FRACTION)

  // Count includes the part tiles at the perimeter (a cut still consumes one).
  const cols = x.full + (x.cut > 0 ? 2 : 0)
  const rows = z.full + (z.cut > 0 ? 2 : 0)

  return {
    roomId: room.id,
    roomName: room.name,
    materialId: material.id,
    materialName: material.name,
    moduleMm: [mw, mh],
    extentMm,
    fullTiles: [x.full, z.full],
    cutMm,
    originMm: cutMm,
    sliver,
    tileCount: cols * rows,
  }
}

/**
 * Coursing for every room with a specified modular floor finish, ordered as the
 * plan's rooms are. Rooms with no module are omitted — the caller states how
 * many were omitted rather than implying the schedule is complete.
 */
export function planTileCoursing(
  plan: FloorPlan,
  floorFinishes: Record<string, string | undefined>,
  materials: Record<string, MaterialDef | undefined>,
): { rows: RoomTileCoursing[]; omittedRooms: number } {
  const rows: RoomTileCoursing[] = []
  let omittedRooms = 0
  for (const room of plan.rooms ?? []) {
    if (planRoomArea(room) <= 0) continue
    const matId = floorFinishes[room.id]
    const row = roomTileCoursing(room, matId ? materials[matId] : undefined)
    if (row) rows.push(row)
    else omittedRooms += 1
  }
  return { rows, omittedRooms }
}
