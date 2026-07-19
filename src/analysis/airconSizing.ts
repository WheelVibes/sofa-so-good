/**
 * Per-room aircon (BTU) cooling-load advisory (R4-1). For each habitable room we
 * estimate the recommended cooling capacity (BTU/hr) from its floor area and a
 * small set of documented modifiers, then round up to the smallest standard SG
 * split-unit size. A rule-of-thumb sizing aid — NOT an engineered heat-load
 * calculation (no glazing/occupancy/appliance breakdown) — surfaced next to the
 * daylight check so a user can sanity-check installer quotes.
 *
 * Pure logic only — no React, no three — so it stays fully unit-testable, exactly
 * like `daylight.ts` (which this mirrors). The panel (`ui/DaylightPanel.tsx`) is
 * presentation over the rows this returns.
 *
 * Sources for the constants:
 *   - silverbackaircon.sg/aircon-btu-calculation-guide
 *   - skyblueaircon.com/blog/what-size-btu-for-hdb-room
 * Both give the SG rule of thumb of ~50–60 BTU per ft² of floor, plus the common
 * uplift for west/east sun exposure, high ceilings, and an open kitchen.
 */

import { isMultiLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import type { PlanClippedWall, PlanRoomShell } from '../floorplan/planRoomShell'
import { planRoomShell } from '../floorplan/planRoomShell'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, PlanOpening, PlanRoom } from '../floorplan/types'
import { planRoomArea } from '../floorplan/types'
import { isExternalRoom } from './daylight'

/**
 * BTU/hr per m² of floor — the base cooling load. The SG rule of thumb is
 * 50–60 BTU/ft², i.e. 50 × 10.7639 ≈ 538 to 60 × 10.7639 ≈ 646 BTU/m². We use a
 * single documented mid-range constant (sources in the module header).
 */
export const BTU_PER_SQM = 600

/**
 * Uplift when the room has an exterior wall facing due **east or west** — the
 * worst orientations for solar heat gain in the tropics (low morning/afternoon
 * sun striking the wall directly). +15% is the common installer allowance.
 */
export const ORIENTATION_UPLIFT = 0.15

/**
 * Uplift for a high ceiling — more air volume to cool. Applied when the ceiling
 * exceeds 3 m (double-volume living rooms, penthouses, loft units). +20%.
 */
export const CEILING_UPLIFT = 0.2
/** Ceiling height (m) above which the high-ceiling uplift applies. */
export const HIGH_CEILING_M = 3

/**
 * Flat BTU/hr added to the LIVING room when an OPEN kitchen vents into it — the
 * cooktop/appliance heat load spills into the shared living/dining zone rather
 * than a sealed kitchen. +4000 BTU is the typical installer add-on.
 */
export const OPEN_KITCHEN_BTU = 4000

/**
 * Minimum opening width (m) between a kitchen and a living/dining room for the
 * kitchen to count as "open plan". A regular door (~0.9 m) does NOT qualify; a
 * wide pass-through / no-door archway (≥ 1.8 m) does. This is the documented,
 * testable adjacency heuristic (see `isOpenKitchenAdjacency`).
 */
export const OPEN_KITCHEN_MIN_OPENING = 1.8

/** Standard SG residential split-unit capacities (BTU/hr), ascending. */
export const SYSTEM_SIZES = [9000, 12000, 18000, 24000] as const

/** Which modifiers were applied to a room's recommendation. */
export interface AirconModifiers {
  /** Room has an exterior E/W-facing wall → +ORIENTATION_UPLIFT. */
  orientation: boolean
  /** Ceiling height > HIGH_CEILING_M → +CEILING_UPLIFT. */
  ceiling: boolean
  /** An open kitchen vents into this (living/dining) room → +OPEN_KITCHEN_BTU. */
  openKitchen: boolean
  /** The flat BTU added for the open kitchen (0 unless `openKitchen`). */
  openKitchenBtu: number
}

/** One room's cooling-load result. */
export interface AirconRow {
  roomId: string
  roomName: string
  /** Interior floor area, m². */
  floorArea: number
  /** Base load before modifiers: floorArea × BTU_PER_SQM. */
  baseBtu: number
  appliedModifiers: AirconModifiers
  /** Recommended capacity after modifiers, BTU/hr (rounded to a whole BTU). */
  recommendedBtu: number
  /** Smallest standard system size ≥ recommended (capped at the largest size;
   *  0 for a degenerate zero-area room). */
  systemBtu: number
  /** True when the recommendation exceeds the largest single unit (24000) — the
   *  room needs multiple units or a larger commercial system. */
  needsMultipleUnits: boolean
}

/** Whole-report summary (mirrors `DaylightReport`'s shape). */
export interface AirconReport {
  rooms: AirconRow[]
  /** Sum of every room's recommended BTU/hr. */
  totalBtu: number
  /** Sum of every room's chosen system size (installed capacity). */
  totalSystemBtu: number
  /** The North orientation (deg) used for the E/W solar-gain test. */
  orientationDeg: number
  constants: {
    btuPerSqm: number
    orientationUplift: number
    ceilingUplift: number
    highCeilingM: number
    openKitchenBtu: number
  }
}

const normalizeDeg = (deg: number): number => {
  if (!Number.isFinite(deg)) return 0
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

/** Smallest angular distance (deg) between two compass bearings, 0..180. */
function angularDistance(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b))
  return d > 180 ? 360 - d : d
}

/**
 * Compass bearing (deg, N=0/E=90/S=180/W=270) of a wall's OUTWARD normal in the
 * app's world frame (+X east, +Z south, so −Z north), at the default North
 * orientation. Mirrors `roomWalls.ts`'s side logic: a wall running mostly along
 * X is a horizontal edge → North (−Z) / South (+Z) of the room centre; one along
 * Z → West (−X) / East (+X). Pure geometry — no shell/three dependency.
 */
function worldWallBearing(wall: PlanClippedWall, center: [number, number]): number {
  const dx = Math.abs(wall.end[0] - wall.start[0])
  const dz = Math.abs(wall.end[1] - wall.start[1])
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  if (dx >= dz) return midZ < center[1] ? 0 : 180 // N : S
  return midX < center[0] ? 270 : 90 // W : E
}

/**
 * Does this room have an EXTERIOR wall whose TRUE (North-corrected) outward
 * normal points within ±45° of due-east (90°) or due-west (270°)? Those are the
 * worst solar-gain orientations. `orientationDeg` rotates the plan's world frame
 * onto true North (added to each wall's world bearing).
 */
function hasEastWestExteriorWall(shell: PlanRoomShell, orientationDeg: number): boolean {
  for (const wall of shell.walls) {
    if (wall.thickness !== 'external') continue
    const trueBearing = normalizeDeg(worldWallBearing(wall, shell.center) + orientationDeg)
    if (angularDistance(trueBearing, 90) <= 45 || angularDistance(trueBearing, 270) <= 45) {
      return true
    }
  }
  return false
}

/**
 * Is the kitchen `k` open onto the living/dining room `ld`? Heuristic: the two
 * rooms share a bounding wall that carries an opening at least
 * `OPEN_KITCHEN_MIN_OPENING` wide (a wide pass-through / no-door archway — a
 * normal ~0.9 m door does NOT count). Documented + testable; a narrower or
 * closed kitchen contributes no open-kitchen load.
 */
function isOpenKitchenAdjacency(
  kShell: PlanRoomShell,
  ldShell: PlanRoomShell,
  openings: PlanOpening[],
): boolean {
  const kWallIds = new Set(kShell.walls.map((w) => w.wallId))
  const sharedWallIds = new Set(ldShell.walls.map((w) => w.wallId).filter((id) => kWallIds.has(id)))
  if (sharedWallIds.size === 0) return false
  return openings.some(
    (o) => sharedWallIds.has(o.wallId) && Math.max(0, o.width) >= OPEN_KITCHEN_MIN_OPENING,
  )
}

/** Smallest system size ≥ recommended; largest size when it overflows; 0 when
 *  there is no meaningful load (degenerate zero-area room). */
function chooseSystemSize(recommendedBtu: number): {
  systemBtu: number
  needsMultipleUnits: boolean
} {
  if (recommendedBtu <= 0) return { systemBtu: 0, needsMultipleUnits: false }
  const fit = SYSTEM_SIZES.find((s) => s >= recommendedBtu)
  if (fit != null) return { systemBtu: fit, needsMultipleUnits: false }
  return { systemBtu: SYSTEM_SIZES[SYSTEM_SIZES.length - 1], needsMultipleUnits: true }
}

const CONSTANTS = {
  btuPerSqm: BTU_PER_SQM,
  orientationUplift: ORIENTATION_UPLIFT,
  ceilingUplift: CEILING_UPLIFT,
  highCeilingM: HIGH_CEILING_M,
  openKitchenBtu: OPEN_KITCHEN_BTU,
}

/**
 * Build the per-room cooling-load report. `orientationDeg` is the plan's North
 * orientation (from `orientationSlice`) used only for the E/W solar-gain test;
 * pass 0 when unknown. Never returns NaN — a zero-area or empty plan yields
 * zeroed rows/totals.
 */
export function buildAirconSizing(plan: FloorPlan, orientationDeg = 0): AirconReport {
  const north = normalizeDeg(orientationDeg)

  // Multi-storey: assess each storey's rooms against ITS OWN walls/openings (a
  // ground E/W wall must not upsize an upstairs bedroom), then merge — mirrors
  // `buildDaylightReport`.
  if (isMultiLevel(plan)) {
    const rooms = planLevels(plan).flatMap(
      (level) => buildAirconSizing(levelAsPlan(plan, level), north).rooms,
    )
    return summarize(rooms, north)
  }

  const planRooms: PlanRoom[] = Array.isArray(plan.rooms) ? plan.rooms : []
  const planOpenings: PlanOpening[] = Array.isArray(plan.openings) ? plan.openings : []
  const interiorRooms = planRooms.filter((r) => !isExternalRoom(r))

  // One shell per room (pure — clipped walls + centre), reused for both the
  // orientation test and the open-kitchen adjacency scan.
  const shellById = new Map<string, PlanRoomShell>()
  for (const r of interiorRooms) {
    const shell = planRoomShell(plan, r.id)
    if (shell) shellById.set(r.id, shell)
  }

  // Which living/dining rooms receive the open-kitchen add-on: any that a
  // kitchen opens onto via a wide shared opening.
  const openKitchenTargets = new Set<string>()
  const kitchens = interiorRooms.filter((r) => roomCategory(r) === 'kitchen')
  const livingDining = interiorRooms.filter((r) => {
    const c = roomCategory(r)
    return c === 'living' || c === 'dining'
  })
  for (const k of kitchens) {
    const kShell = shellById.get(k.id)
    if (!kShell) continue
    for (const ld of livingDining) {
      const ldShell = shellById.get(ld.id)
      if (!ldShell) continue
      if (isOpenKitchenAdjacency(kShell, ldShell, planOpenings)) openKitchenTargets.add(ld.id)
    }
  }

  const rooms: AirconRow[] = interiorRooms.map((r) => {
    const floorArea = Math.max(0, planRoomArea(r))
    const baseBtu = floorArea * BTU_PER_SQM

    const shell = shellById.get(r.id)
    const orientation = shell ? hasEastWestExteriorWall(shell, north) : false
    const ceilingH = r.ceilingHeight ?? plan.ceilingHeight
    const ceiling = Number.isFinite(ceilingH) && ceilingH > HIGH_CEILING_M
    const openKitchen = openKitchenTargets.has(r.id)
    const openKitchenBtu = openKitchen ? OPEN_KITCHEN_BTU : 0

    const upliftFactor = 1 + (orientation ? ORIENTATION_UPLIFT : 0) + (ceiling ? CEILING_UPLIFT : 0)
    const recommendedBtu = Math.round(baseBtu * upliftFactor + openKitchenBtu)
    const { systemBtu, needsMultipleUnits } = chooseSystemSize(recommendedBtu)

    return {
      roomId: r.id,
      roomName: r.name,
      floorArea,
      baseBtu,
      appliedModifiers: { orientation, ceiling, openKitchen, openKitchenBtu },
      recommendedBtu,
      systemBtu,
      needsMultipleUnits,
    }
  })

  return summarize(rooms, north)
}

function summarize(rooms: AirconRow[], orientationDeg: number): AirconReport {
  return {
    rooms,
    totalBtu: rooms.reduce((sum, r) => sum + r.recommendedBtu, 0),
    totalSystemBtu: rooms.reduce((sum, r) => sum + r.systemBtu, 0),
    orientationDeg,
    constants: CONSTANTS,
  }
}
