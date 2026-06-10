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
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { planRoomArea, pointInRoom, wallLength } from '../floorplan/types'

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
export interface DaylightRow {
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

/** Unit-direction + perpendicular of a wall, or null for a zero-length wall. */
function wallAxes(w: PlanWall): { ux: number; uz: number; px: number; pz: number } | null {
  const len = wallLength(w)
  if (len <= 0) return null
  const ux = (w.end[0] - w.start[0]) / len
  const uz = (w.end[1] - w.start[1]) / len
  // Perpendicular (rotate the unit vector 90°).
  return { ux, uz, px: -uz, pz: ux }
}

/**
 * Finds the room a window borders. The window's centre sits on the wall; we probe
 * a short distance to each side of the wall and return whichever room contains a
 * probe point. Returns null when no (non-external) room is found — e.g. a window
 * onto the outside on an external wall.
 */
function roomForWindow(
  rooms: PlanRoom[],
  wallsById: Map<string, PlanWall>,
  o: PlanOpening,
): PlanRoom | null {
  const wall = wallsById.get(o.wallId)
  if (!wall) return null
  const axes = wallAxes(wall)
  if (!axes) return null
  const len = wallLength(wall)
  // Window centre along the wall (clamped into the wall span for safety).
  const s = Math.max(0, Math.min(len, o.offset + o.width / 2))
  const cx = wall.start[0] + axes.ux * s
  const cz = wall.start[1] + axes.uz * s
  for (const sign of [1, -1]) {
    const px = cx + axes.px * PROBE_OFFSET * sign
    const pz = cz + axes.pz * PROBE_OFFSET * sign
    for (const r of rooms) {
      if (pointInRoom(r, px, pz)) return r
    }
  }
  return null
}

/**
 * Builds the per-room daylight & ventilation report. `items` is accepted for API
 * symmetry with the other analyses (future: count furniture blocking a window) but
 * is not used by the glazing maths today.
 */
export function buildDaylightReport(plan: FloorPlan, _items?: unknown): DaylightReport {
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
