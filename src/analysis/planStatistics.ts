/**
 * Plan-statistics digest (PARITY-PLAN-STATS).
 *
 * A single, unified read of a plan's quantitative shape — total gross floor
 * area, room count + count-by-kind, average room size, total wall perimeter
 * and total wall length, plus a net-vs-circulation split when corridor /
 * hallway rooms are present. This is the "by the numbers" summary competitors
 * (Coohom, Planner 5D) surface alongside a printable report.
 *
 * Pure + deterministic + unit-testable: depends only on the floorplan model
 * helpers, never on three/React. Aggregates across ALL storeys (multi-level
 * plans) via `allPlanRooms` / `planLevels`, reusing the SAME geometry helpers
 * (`planRoomArea`, `planRoomPerimeter`, `wallLength`) the rest of the app uses
 * so the numbers reconcile with the room schedule and 2D labels.
 *
 * Edge cases: an empty / bare-shell plan yields a fully zeroed digest (never
 * NaN/undefined); rooms whose name matches no known kind bucket as `'other'`.
 */

import { allPlanRooms, planLevels } from '../floorplan/levels'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea, planRoomPerimeter, wallLength } from '../floorplan/types'
import { type RoomKind, roomKindFromName } from './suggestions'

/** Room name patterns that read as circulation (corridor / hallway / foyer /
 *  lobby / landing / passage). Kept separate from `roomKindFromName` (which
 *  folds "hall" into `living`) so the net-vs-circulation split can isolate the
 *  movement spine from the habitable rooms. */
const CIRCULATION_RE = /(corridor|hallway|\bhall\b|foyer|lobby|landing|passage|vestibule)/i

/** Whether a room reads as circulation space (a corridor / hallway), by name. */
export function isCirculationRoom(r: Pick<PlanRoom, 'name'>): boolean {
  return CIRCULATION_RE.test(r.name ?? '')
}

/** Per-kind tally: how many rooms of a kind, and their combined area (m²). */
export interface RoomKindStat {
  kind: RoomKind
  count: number
  /** Combined interior floor area of rooms of this kind (m²). */
  areaSqm: number
}

/** The unified plan-statistics digest. All areas are m², lengths metres. */
export interface PlanStatistics {
  /** Total gross floor area — sum of every room's interior area across ALL
   *  storeys (m²). 0 for an empty plan. */
  totalAreaSqm: number
  /** Total number of rooms across all storeys. */
  roomCount: number
  /** Number of storeys (ground + upper levels); always ≥ 1. */
  levelCount: number
  /** Per-kind breakdown, sorted by descending area then kind name. Only kinds
   *  that actually occur appear. */
  byKind: RoomKindStat[]
  /** Average room interior area (m²) = totalAreaSqm / roomCount. 0 when there
   *  are no rooms (never NaN). */
  averageRoomSqm: number
  /** Total room-outline perimeter summed over every room (m). */
  totalPerimeterM: number
  /** Total wall length summed over every storey's walls (m). */
  totalWallLengthM: number
  /** Combined area of circulation rooms (corridors / hallways), m². */
  circulationSqm: number
  /** Net (non-circulation) habitable area = totalAreaSqm − circulationSqm, m². */
  netAreaSqm: number
  /** Circulation as a fraction of total area, 0..1 (0 when no area). */
  circulationFraction: number
}

/** A fully-zeroed digest — the result for an empty / bare-shell plan. */
function emptyStatistics(levelCount: number): PlanStatistics {
  return {
    totalAreaSqm: 0,
    roomCount: 0,
    levelCount,
    byKind: [],
    averageRoomSqm: 0,
    totalPerimeterM: 0,
    totalWallLengthM: 0,
    circulationSqm: 0,
    netAreaSqm: 0,
    circulationFraction: 0,
  }
}

/**
 * Build the plan-statistics digest. Pure — never throws; a plan with no rooms
 * (and/or no walls) returns a zeroed digest with the correct `levelCount`.
 */
export function buildPlanStatistics(plan: FloorPlan): PlanStatistics {
  const levels = planLevels(plan)
  const levelCount = levels.length
  const rooms = allPlanRooms(plan)

  // Total wall length spans every storey (each level carries its own walls).
  const totalWallLengthM = levels.reduce(
    (sum, level) => sum + (level.walls ?? []).reduce((s, w) => s + wallLength(w), 0),
    0,
  )

  if (rooms.length === 0) {
    return { ...emptyStatistics(levelCount), totalWallLengthM }
  }

  let totalAreaSqm = 0
  let totalPerimeterM = 0
  let circulationSqm = 0
  // Accumulate per-kind tallies in a map, then materialise to a sorted array.
  const byKindMap = new Map<RoomKind, { count: number; areaSqm: number }>()

  for (const r of rooms) {
    const area = planRoomArea(r)
    totalAreaSqm += area
    totalPerimeterM += planRoomPerimeter(r)
    if (isCirculationRoom(r)) circulationSqm += area
    const kind = roomKindFromName(r.name)
    const acc = byKindMap.get(kind) ?? { count: 0, areaSqm: 0 }
    acc.count += 1
    acc.areaSqm += area
    byKindMap.set(kind, acc)
  }

  const byKind: RoomKindStat[] = [...byKindMap.entries()]
    .map(([kind, v]) => ({ kind, count: v.count, areaSqm: v.areaSqm }))
    .sort((a, b) => b.areaSqm - a.areaSqm || a.kind.localeCompare(b.kind))

  const netAreaSqm = Math.max(0, totalAreaSqm - circulationSqm)

  return {
    totalAreaSqm,
    roomCount: rooms.length,
    levelCount,
    byKind,
    averageRoomSqm: totalAreaSqm / rooms.length,
    totalPerimeterM,
    totalWallLengthM,
    circulationSqm,
    netAreaSqm,
    circulationFraction: totalAreaSqm > 0 ? circulationSqm / totalAreaSqm : 0,
  }
}

/** Friendly label for a room kind (Title Case), for report headings/tables. */
export function roomKindLabel(kind: RoomKind): string {
  switch (kind) {
    case 'living':
      return 'Living'
    case 'dining':
      return 'Dining'
    case 'bedroom':
      return 'Bedroom'
    case 'kitchen':
      return 'Kitchen'
    case 'bath':
      return 'Bathroom'
    case 'study':
      return 'Study'
    case 'balcony':
      return 'Balcony / service'
    default:
      return 'Other'
  }
}
