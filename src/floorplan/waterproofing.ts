/**
 * Waterproofing-zone model (blank-slate BSJ-7).
 *
 * Turns the wet-area waterproofing ADVISORY (`analysis/hdbCompliance.ts` +
 * `renoTimeline` + `renoRulesPack`) into a MODELED zone per wet room, derived
 * purely from the room categories + placed items — no new persisted field. Each
 * zone is the room's floor extent plus its wall-upturn heights, following SG
 * tiling/waterproofing convention:
 *
 *  - **300 mm general upturn** on every wet-area wall (the membrane is turned up
 *    the wall foot so splashes can't wick behind the tiles). (PUB/BCA good-
 *    practice; the figure cited across SG waterproofing specs is ≥150–300 mm — we
 *    use the more conservative 300 mm.)
 *  - **1800 mm upturn at shower walls** — the full wet zone around a standing
 *    shower. The shower location comes from a placed `shower` / `shower-screen`
 *    item when present (a localized two-wall run); when a bath has NO placed
 *    shower we take the FULL bath perimeter at 1800 mm conservatively (the tiler
 *    would waterproof the whole enclosure rather than guess where the shower
 *    goes).
 *  - **Kitchen / service yard / balcony**: 300 mm general upturn only (kitchens
 *    at the sink run; the general band conservatively covers it — there is no
 *    modeled sink-run geometry to localize to, documented here).
 *
 * The membrane AREA (m²) a tiler/waterproofer prices from is the floor area plus
 * the upturn bands (perimeter × general height, plus the extra height over shower
 * walls). Fed to the finish schedule + tiler pack (BSJ-5) + the whole-reno budget
 * allocator's waterproofing sub-line (BSJ-1).
 *
 * Pure + unit-tested — no store / React / three. Items are taken as a minimal
 * `{ defId, position }` shape so this stays free of the furniture types.
 */

import { allPlanRooms } from './levels'
import { roomCategory } from './roomCategory'
import {
  type FloorPlan,
  type PlanRoom,
  planRoomArea,
  planRoomPerimeter,
  pointInRoom,
  type RoomCategory,
} from './types'

/** Room categories that get a waterproofing membrane (wet + hard-service). */
export const WATERPROOF_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'bath',
  'powder',
  'kitchen',
  'serviceYard',
  'balcony',
])

/**
 * General wall-upturn height on every wet-area wall (mm).
 *
 * **BCA Good Industry Practices** (waterproofing for internal wet areas, under
 * Code of Practice SS 637:2018): the membrane "should have an upturn of at least
 * 300mm to create minimum tanking protection against migration of water to
 * spaces adjacent or below the wet area", and walls "should be rendered to a
 * smooth minimum height of 300 mm from floor level to receive waterproofing
 * treatment upturn".
 *
 * Some practice notes give 150 mm as an absolute floor with ~300 mm "ideally" on
 * splash walls. 300 mm is taken because it is the figure BCA's own guidance
 * states, and because the direction of error matters here: under-specifying
 * waterproofing is discovered as a leak into the room below, which is far more
 * expensive than an extra 150 mm of membrane.
 *
 * A STANDARD, not a derived dimension — sourced v0.31.8.15, when the
 * construction-details sheet was found claiming every dimension on it was
 * "derived from the design and exact".
 */
export const GENERAL_UPTURN_MM = 300
/**
 * Wall-upturn height at shower walls (mm).
 *
 * **BCA Good Industry Practices**: the membrane "should be applied to at least
 * 1800mm height and 1500mm width of the wall or the entire enclosure at bath and
 * shower areas". Also a STANDARD rather than a derived dimension.
 *
 * Only the HEIGHT is reported as a detail dimension; the 1500 mm width bound is
 * covered by `SHOWER_RUN_PER_ITEM_M` (2.4 m nominal per shower, comfortably
 * above 1.5 m) which drives the membrane QUANTITY rather than the detail.
 */
export const SHOWER_UPTURN_MM = 1800
/** Nominal two-wall run (m) taken at the shower upturn per detected shower item
 *  (a corner enclosure ≈ two 1.2 m returns). Conservative when a bath has no
 *  placed shower: the whole perimeter is used instead (see `showerWallRunM`). */
const SHOWER_RUN_PER_ITEM_M = 2.4

/** Rooms that get a shower-wall (1800 mm) zone at all — the enclosed wet rooms. */
const SHOWER_WALL_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>(['bath', 'powder'])

/** Def-id pattern for a placed shower / shower screen (localizes the 1800 mm zone). */
const SHOWER_RE = /shower/i

/** A minimal placed-item shape — just what shower detection needs. Keeps this
 *  module free of the furniture types. */
export interface WaterproofingItem {
  defId: string
  position: readonly number[]
}

/** One modeled waterproofing zone (per wet room). */
export interface WaterproofingZone {
  roomId: string
  roomName: string
  category: RoomCategory
  /** Room floor area (m²) — the membrane's floor extent. */
  floorAreaM2: number
  /** Room interior perimeter (m) — the wall run the general upturn covers. */
  perimeterM: number
  /** General wall-upturn height (mm) on every wet-area wall. */
  generalUpturnMm: number
  /** Shower-wall upturn height (mm); undefined for kitchen / yard / balcony. */
  showerUpturnMm?: number
  /** True when a placed shower/shower-screen located the shower walls (a
   *  localized run); false = no shower item, so a conservative full-perimeter
   *  1800 mm zone is used for a bath. */
  showerDetected: boolean
  /** Length of wall (m) taken at the shower upturn (localized run, or the full
   *  perimeter conservatively). 0 for non-shower rooms. */
  showerWallRunM: number
  /** Total waterproofing membrane area (m²): floor + upturn bands. */
  membraneAreaM2: number
}

/** Build the modeled waterproofing zones for every wet room in the plan (all
 *  storeys). Pure; never throws — an empty / malformed plan yields `[]`. */
export function buildWaterproofingZones(
  plan: FloorPlan,
  items: readonly WaterproofingItem[] = [],
): WaterproofingZone[] {
  const rooms = allPlanRooms(plan)
  const out: WaterproofingZone[] = []
  for (const room of rooms) {
    const category = roomCategory(room)
    if (!WATERPROOF_CATEGORIES.has(category)) continue
    out.push(zoneForRoom(room, category, items))
  }
  return out
}

function zoneForRoom(
  room: PlanRoom,
  category: RoomCategory,
  items: readonly WaterproofingItem[],
): WaterproofingZone {
  const floorAreaM2 = Math.max(0, planRoomArea(room))
  const perimeterM = Math.max(0, planRoomPerimeter(room))
  const hasShowerWalls = SHOWER_WALL_CATEGORIES.has(category)

  // Shower items whose centre lands in this room localize the 1800 mm walls.
  let showerRun = 0
  let showerDetected = false
  for (const it of items) {
    if (!SHOWER_RE.test(it.defId)) continue
    const pos = it.position
    if (!Array.isArray(pos)) continue
    const x = pos[0]
    const z = pos[1]
    if (typeof x !== 'number' || typeof z !== 'number') continue
    if (!pointInRoom(room, x, z)) continue
    showerDetected = true
    showerRun += SHOWER_RUN_PER_ITEM_M
  }

  let showerUpturnMm: number | undefined
  let showerWallRunM = 0
  if (hasShowerWalls) {
    showerUpturnMm = SHOWER_UPTURN_MM
    // Detected → the localized run (capped at the perimeter); else conservative
    // full perimeter at the shower height.
    showerWallRunM = showerDetected ? Math.min(perimeterM, showerRun) : perimeterM
  }

  // Membrane area = floor + full-perimeter general band + extra height over
  // shower walls (shower height − general height).
  const generalBand = perimeterM * (GENERAL_UPTURN_MM / 1000)
  const showerExtraBand = hasShowerWalls
    ? showerWallRunM * ((SHOWER_UPTURN_MM - GENERAL_UPTURN_MM) / 1000)
    : 0
  const membraneAreaM2 = floorAreaM2 + generalBand + showerExtraBand

  return {
    roomId: room.id,
    roomName: room.name,
    category,
    floorAreaM2,
    perimeterM,
    generalUpturnMm: GENERAL_UPTURN_MM,
    showerUpturnMm,
    showerDetected,
    showerWallRunM,
    membraneAreaM2,
  }
}

/** Total membrane area (m²) across every zone — the waterproofing budget quantity. */
export function totalMembraneAreaM2(zones: readonly WaterproofingZone[]): number {
  return zones.reduce((s, z) => s + Math.max(0, z.membraneAreaM2), 0)
}

/** Human upturn summary for a zone, e.g. "300 mm + 1800 mm shower". */
export function upturnLabel(zone: WaterproofingZone): string {
  if (zone.showerUpturnMm == null) return `${zone.generalUpturnMm} mm`
  const showerNote = zone.showerDetected ? 'shower walls' : 'full perimeter (no shower placed)'
  return `${zone.generalUpturnMm} mm · ${zone.showerUpturnMm} mm ${showerNote}`
}
