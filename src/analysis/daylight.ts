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
import { HABITABLE_CATEGORIES, roomCategory } from '../floorplan/roomCategory'
import { roomBoundaryWalls } from '../floorplan/roomWallNames'
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
  /**
   * True when NO wall bounding the room is on the façade, so no window can ever
   * be added and a daylight/ventilation shortfall has no remedy. See
   * `hasNoFacade`.
   */
  noFacade: boolean
  /**
   * True for a room category that needs natural light to be usable as designed
   * (`HABITABLE_CATEGORIES`). An interior HABITABLE room is a layout defect, not
   * an exemption — see `isDaylightExempt`.
   */
  habitable: boolean
  /**
   * True for an HDB household shelter (`RoomCategory` `'shelter'`) — a
   * reinforced-concrete civil-defence enclosure. Windowless by design AND
   * prohibited from being altered, so it is never assessed even when it sits on
   * the façade. See `isDaylightExempt`.
   */
  blastShelter: boolean
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
 * Can this room's shortfall be remedied at all? Only a room that touches the
 * FAÇADE can gain or widen a window — an interior room has no wall to put one
 * in, so advising "add or widen windows" there asks for something impossible.
 * `PlanWall.thickness === 'external'` is the façade marker the whole app already
 * uses (minimap stroke weight, plan-SVG wall widths, the editor's wall layers).
 *
 * The HDB **household shelter** is the canonical case: a reinforced-concrete
 * blast shelter sits inside the flat and is windowless BY DESIGN, yet on the
 * shipped default flat it was reported as failing daylight AND ventilation with
 * no legal fix available.
 *
 * NOTE this deliberately does NOT test `wallHackability`. That was the first
 * attempt and it was wrong: `establishedWallStructure` maps an external wall to
 * `load-bearing` → NOT PERMITTED, but "cannot be demolished" is not "cannot hold
 * a window" — every window in the flat is in an external load-bearing wall.
 * Measured on the corpus, that version flagged `tpl-hdb-jumbo`'s **Master
 * Bedroom** as unassessable, suppressing a genuine windowless-bedroom finding.
 * A façade test keeps that finding and still exempts the shelter.
 *
 * `roomBoundaryWalls` matches a wall within 0.25 m of a boundary edge, so an
 * interior room hugging an external wall reads as façade-facing and keeps its
 * advice. That is the safe direction — a kept advisory is a smaller fault than a
 * silently suppressed one — so the tolerance is left as the naming pass sets it.
 *
 * Callers must additionally require ZERO glazing: this predicate and the
 * window-to-room probe are two different associations and they can disagree. On
 * the shipped default flat, `Bath/WC 2` resolves to all-internal bounding walls
 * yet the probe attributes a window to it (7.4% glazing) — a room with real
 * glazing plainly HAS a façade, and reporting it as unassessable would hide an
 * actionable "widen the window" finding behind an N/A.
 */
function hasNoFacade(room: PlanRoom, walls: readonly PlanWall[]): boolean {
  const bounding = roomBoundaryWalls(walls, room)
  return bounding.length > 0 && bounding.every((w) => w.thickness !== 'external')
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
    const category = roomCategory(r)
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
      // Zero glazing is required as well as no façade wall — see `hasNoFacade`.
      noFacade: glazingArea === 0 && hasNoFacade(r, planWalls),
      habitable: HABITABLE_CATEGORIES.has(category),
      blastShelter: category === 'shelter',
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

/**
 * Should this room be left out of the daylight/ventilation assessment entirely?
 * Only when no window is possible (`noFacade`) AND the room does not need
 * natural light in the first place.
 *
 * An interior room in a HABITABLE category is deliberately NOT exempt: a bedroom
 * or lounge with no external wall has no daylight at all, which is a layout
 * defect that must keep counting against the plan — measured on the corpus,
 * `tpl-hdb-4room`/`-5room`/`-exec` each author an interior `Bedroom 3` and
 * `tpl-condo-penthouse` an interior `Lounge`.
 *
 * A **household shelter** is exempt unconditionally, façade or not. The façade
 * test alone was not enough: measured across the corpus, 7 templates
 * (`tpl-hdb-3room`, `-4room`, `-5room`, `-exec`, `-3gen`, `-jumbo`,
 * `-maisonette`) author the shelter against an external wall — realistic, since
 * an HDB shelter often forms part of the façade — so they went on advising an
 * opening that its RC walls prohibit. Only knowing the room IS a shelter fixes
 * that, which is why `RoomCategory` gained `'shelter'`.
 *
 * The one predicate every consumer shares (design score, in-app panel, printed
 * report) so the three cannot disagree about which rooms are being counted.
 */
/**
 * Why a row is exempt, for display. The two reasons are NOT interchangeable: a
 * household shelter on the façade genuinely HAS an external wall, so calling it
 * an "interior room" would be false — it is exempt because an opening in its RC
 * walls is not permitted. Checked in the same order as `isDaylightExempt`.
 */
export function exemptReason(
  row: Pick<DaylightRow, 'noFacade' | 'habitable' | 'blastShelter'>,
): string {
  if (row.blastShelter) return 'household shelter — RC walls, no opening permitted'
  return 'interior room, no external wall for a window'
}

export function isDaylightExempt(
  row: Pick<DaylightRow, 'noFacade' | 'habitable' | 'blastShelter'>,
): boolean {
  return row.blastShelter || (row.noFacade && !row.habitable)
}
