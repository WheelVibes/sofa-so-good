/**
 * Daylight & ventilation check — a per-room HDB/BCA-style code check plus design
 * QC. For each interior room we sum the glazing area of every window opening on a
 * wall that bounds the room (area = width × (head − sill)), then compare it to the
 * room's floor area against rule-of-thumb thresholds:
 *   - daylight: glazing ≥ 10% of floor area
 *   - ventilation: openable area (≈ 50% of window area for sliding windows)
 *     ≥ 5% of floor area
 *
 * Pure logic only — no React, no three — so it stays fully unit-testable. The
 * panel (`ui/DaylightPanel.tsx`) is presentation over the rows this returns.
 */
import { isMultiLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import { roomsAcrossOpening } from '../floorplan/openingProbe'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { planRoomArea } from '../floorplan/types'

/** Glazing area as a fraction of floor area required to pass the daylight check. */
export const DAYLIGHT_MIN_RATIO = 0.1
/** Openable area as a fraction of floor area required to pass the ventilation check. */
export const VENT_MIN_RATIO = 0.05
/** Fraction of a sliding window's glazing that actually opens (the openable half). */
export const OPENABLE_FRACTION = 0.5
/**
 * How far (m) to nudge a window's centre perpendicular to its wall when testing
 * which room it borders — enough to clear the wall thickness, small enough to
 * land inside a shallow room.
 */
const PROBE_OFFSET = 0.2

/** One room's daylight + ventilation result. */
interface DaylightRow {
  roomId: string
  roomName: string
  /** Interior floor area, m². */
  floorArea: number
  /** Summed window glazing area on walls bounding this room, m². */
  glazingArea: number
  /** glazingArea / floorArea (0 when floorArea is 0). */
  glazingPct: number
  /** Openable (ventilation) area as a fraction of floor area. */
  ventPct: number
  daylightPass: boolean
  ventPass: boolean
}

/** Whole-report summary. */
export interface DaylightReport {
  rooms: DaylightRow[]
  /** Count of rooms passing both checks. */
  passCount: number
  /** Count of rooms failing at least one check. */
  failCount: number
  /** Count of rooms passing the daylight check (glazing ≥ threshold). */
  daylightPassCount: number
  /** Count of rooms passing the ventilation check (openable ≥ threshold). */
  ventPassCount: number
  /** True when every analysed room passes both checks (vacuously true with no rooms). */
  allPass: boolean
  thresholds: {
    daylight: number
    vent: number
  }
}

/** Glazing area of a single window opening (m²): width × (head − sill), floored at 0. */
function openingGlazingArea(o: PlanOpening): number {
  return Math.max(0, o.width) * Math.max(0, o.head - o.sill)
}

/**
 * Rooms that are external annexes / ledges / balconies aren't habitable space, so
 * they're skipped from the check. `PlanRoom` carries no explicit external flag
 * (the editable plan model drops it), so we detect by name — AC ledge, balcony,
 * service ledge, planter, aircon ledge, etc.
 */
const EXTERNAL_NAME = /\b(ledge|balcon|planter|aircon|a\/?c\b|parapet|external)/i

export function isExternalRoom(r: PlanRoom): boolean {
  return EXTERNAL_NAME.test(r.name) || EXTERNAL_NAME.test(r.id)
}

/**
 * Finds the room a window borders. The window's centre sits on the wall; we probe
 * a short distance to each side of the wall and return whichever room contains a
 * probe point (the +normal side is tested first, matching the shared helper's
 * `plus ?? minus`). Returns null when no (non-external) room is found — e.g. a
 * window onto the outside on an external wall.
 */
function roomForWindow(
  rooms: PlanRoom[],
  wallsById: Map<string, PlanWall>,
  o: PlanOpening,
): PlanRoom | null {
  const wall = wallsById.get(o.wallId)
  if (!wall) return null
  // Clamp the along-wall centre into the wall span for safety.
  const across = roomsAcrossOpening(rooms, wall, o, PROBE_OFFSET, true)
  if (!across) return null
  return across.plus ?? across.minus
}

/**
 * Builds the per-room daylight & ventilation report. `items` is accepted for API
 * symmetry with the other analyses (future: count furniture blocking a window) but
 * is not used by the glazing maths today.
 */
export function buildDaylightReport(plan: FloorPlan, _items?: unknown): DaylightReport {
  // Multi-storey (F13/ML5): assess each storey's rooms against ITS OWN
  // walls/openings, then merge — a ground window must not light an upstairs
  // bedroom at the same XZ. Single-level plans skip straight through.
  if (isMultiLevel(plan)) {
    const rows = planLevels(plan).flatMap(
      (level) => buildDaylightReport(levelAsPlan(plan, level)).rooms,
    )
    const passCount = rows.filter((r) => r.daylightPass && r.ventPass).length
    return {
      rooms: rows,
      passCount,
      failCount: rows.length - passCount,
      daylightPassCount: rows.filter((r) => r.daylightPass).length,
      ventPassCount: rows.filter((r) => r.ventPass).length,
      allPass: rows.length - passCount === 0,
      thresholds: { daylight: DAYLIGHT_MIN_RATIO, vent: VENT_MIN_RATIO },
    }
  }
  // Guard a partial / hand-built plan whose arrays may be absent, so every caller
  // is safe without its own outer guard.
  const planRooms = Array.isArray(plan.rooms) ? plan.rooms : []
  const planWalls = Array.isArray(plan.walls) ? plan.walls : []
  const planOpenings = Array.isArray(plan.openings) ? plan.openings : []
  const interiorRooms = planRooms.filter((r) => !isExternalRoom(r))
  const wallsById = new Map(planWalls.map((w) => [w.id, w]))

  // Sum glazing per room id.
  const glazingByRoom = new Map<string, number>()
  for (const o of planOpenings) {
    if (o.kind !== 'window') continue
    const room = roomForWindow(interiorRooms, wallsById, o)
    if (!room) continue
    glazingByRoom.set(room.id, (glazingByRoom.get(room.id) ?? 0) + openingGlazingArea(o))
  }

  const rooms: DaylightRow[] = interiorRooms.map((r) => {
    const floorArea = planRoomArea(r)
    const glazingArea = glazingByRoom.get(r.id) ?? 0
    const ventArea = glazingArea * OPENABLE_FRACTION
    // Zero-area rooms can't be assessed — report 0% and fail both checks rather
    // than divide by zero.
    const glazingPct = floorArea > 0 ? glazingArea / floorArea : 0
    const ventPct = floorArea > 0 ? ventArea / floorArea : 0
    const daylightPass = floorArea > 0 && glazingPct >= DAYLIGHT_MIN_RATIO
    const ventPass = floorArea > 0 && ventPct >= VENT_MIN_RATIO
    return {
      roomId: r.id,
      roomName: r.name,
      floorArea,
      glazingArea,
      glazingPct,
      ventPct,
      daylightPass,
      ventPass,
    }
  })

  const passCount = rooms.filter((r) => r.daylightPass && r.ventPass).length
  const failCount = rooms.length - passCount
  const daylightPassCount = rooms.filter((r) => r.daylightPass).length
  const ventPassCount = rooms.filter((r) => r.ventPass).length

  return {
    rooms,
    passCount,
    failCount,
    daylightPassCount,
    ventPassCount,
    allPass: failCount === 0,
    thresholds: { daylight: DAYLIGHT_MIN_RATIO, vent: VENT_MIN_RATIO },
  }
}
