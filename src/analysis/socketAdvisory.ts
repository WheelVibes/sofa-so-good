/**
 * Electrical socket-count & DB-load advisory (R4-4) — pure data core.
 *
 * A per-room "are there enough power outlets?" target/gap advisory over the
 * user's ALREADY-PLACED MEP electrical points (`FloorPlan.electricalPoints`).
 * This is NOT point placement (that already ships via the `mepEditor` layer) —
 * it's the net-new count-target/shortfall slice that sits beside the electrical
 * plan sheet, plus a static DB-box supply note.
 *
 * For each room it resolves the room's `RoomCategory` (`roomCategory.ts` — the
 * one resolver: explicit `category` wins, else inferred from the name), looks up
 * a recommended socket target ({@link TARGET_SOCKETS_BY_CATEGORY}), and counts
 * the socket OUTLETS the user actually placed in that room. A point is
 * attributed to the first room (across all storeys) whose footprint contains it
 * — the SAME `allPlanRooms` + `pointInRoom` attribution
 * `electricalSchedule.ts:buildDesignedElectricalSchedule` uses, so the two never
 * disagree about which room a point belongs to.
 *
 * OUTLET counting: a single `socket` is 1 outlet, a `socket-double` is 2
 * (twin gang). `data`/`tv-point` are DATA points — counted + reported separately
 * (`dataPlaced`), never folded into the socket total. `switch`/`aircon`/
 * `water-heater` are neither sockets nor data and don't count here.
 *
 * This is an INDICATIVE planning aid, not a certified electrical design — it has
 * no notion of circuits, RCD/MCB sizing or cable runs. Targets are coarse
 * per-room-category norms from SG renovation guides (see the table below).
 *
 * Pure + deterministic (same input → same output); no DOM/React/three. An empty
 * plan yields zero counts and no rows — never NaN.
 */
import { allPlanRooms } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import {
  type FloorPlan,
  type PlanElectricalPoint,
  pointInRoom,
  type RoomCategory,
} from '../floorplan/types'

/**
 * Recommended 13 A socket OUTLET count per room category — coarse SG-renovation
 * norms, not a code minimum. A 4-room HDB flat totals roughly 25–40 outlets
 * across these rooms, matching the cited guides.
 *
 * Sources:
 * - goldberg-home.com/blogs/blogs/how-many-electrical-sockets-do-i-need-for-hdb-bto-singapore
 * - homegenie.com.sg/blogs/news/hdb-electrical-renovation-guide-singapore
 *
 * Categories omitted from this map (`storeroom`/`balcony`/`foyer`/`other`) have
 * no meaningful socket target — they resolve to 0 and are dropped from the
 * advisory rows (an under-provisioned cue on a store or foyer would be noise).
 */
export const TARGET_SOCKETS_BY_CATEGORY: Partial<Record<RoomCategory, number>> = {
  living: 8,
  kitchen: 10,
  masterBedroom: 6,
  bedroom: 4,
  study: 6,
  dining: 4,
  bath: 2,
  powder: 1,
  serviceYard: 2,
}

/**
 * Static DB-box / incoming-supply note (source: homegenie.com.sg HDB electrical
 * renovation guide). Surfaced verbatim on the electrical plan sheet + the MEP
 * editor advisory — a reminder that upgrading capacity is an SP Group process,
 * not a design decision.
 */
export const DB_LOAD_NOTE =
  '40 A single-phase supply is common in older HDB blocks; upgrading to 63 A requires SP Group approval.'

/** Socket-type electrical kinds that contribute OUTLETS toward the target, and
 *  how many outlets each contributes (a twin socket is two). */
const OUTLETS_PER_KIND: Partial<Record<PlanElectricalPoint['kind'], number>> = {
  socket: 1,
  'socket-double': 2,
}

/** Electrical kinds counted as DATA points (reported separately, never as
 *  sockets). */
const DATA_KINDS = new Set<PlanElectricalPoint['kind']>(['data', 'tv-point'])

/** One room's socket advisory line. */
export interface SocketRow {
  roomId: string
  roomName: string
  category: RoomCategory
  /** Recommended socket outlets for this room's category. */
  target: number
  /** Socket outlets the user actually placed here (socket = 1, twin = 2). */
  placed: number
  /** Data points (data / TV) placed here — informational, not part of `placed`. */
  dataPlaced: number
  /** `max(0, target − placed)` — how many outlets short of the target. */
  shortfall: number
  /** Whether the room has fewer placed outlets than its target. */
  underProvisioned: boolean
}

export interface SocketAdvisory {
  /** One row per room with a socket target (>0), in `allPlanRooms` order. */
  rooms: SocketRow[]
  /** How many rows are under-provisioned. */
  underProvisionedCount: number
  /** Sum of every row's target. */
  totalTarget: number
  /** Sum of every row's placed outlets. */
  totalPlaced: number
  /** Static incoming-supply / DB note. */
  dbNote: string
}

/** Recommended socket target for a room category (0 when the category has no
 *  meaningful target). */
export function targetSocketsFor(category: RoomCategory): number {
  return TARGET_SOCKETS_BY_CATEGORY[category] ?? 0
}

/**
 * Build the socket-count & DB-load advisory for a plan from its persisted
 * electrical points. Rooms with no socket target (store/balcony/foyer/other)
 * are omitted. Points outside every room are ignored (they belong to no room's
 * count). Pure + deterministic; an empty plan yields `{ rooms: [],
 * underProvisionedCount: 0, totalTarget: 0, totalPlaced: 0, dbNote }`.
 */
export function buildSocketAdvisory(plan: FloorPlan): SocketAdvisory {
  const rooms = allPlanRooms(plan)
  const points = Array.isArray(plan?.electricalPoints) ? plan.electricalPoints : []

  const outlets = new Map<string, number>()
  const data = new Map<string, number>()
  for (const p of points) {
    const room = rooms.find((r) => pointInRoom(r, p.x, p.z))
    if (!room) continue // outside every room → belongs to no room's count
    const add = OUTLETS_PER_KIND[p.kind]
    if (add) outlets.set(room.id, (outlets.get(room.id) ?? 0) + add)
    else if (DATA_KINDS.has(p.kind)) data.set(room.id, (data.get(room.id) ?? 0) + 1)
  }

  const out: SocketRow[] = []
  let underProvisionedCount = 0
  let totalTarget = 0
  let totalPlaced = 0
  for (const r of rooms) {
    const category = roomCategory(r)
    const target = targetSocketsFor(category)
    if (target <= 0) continue // no meaningful target — omit
    const placed = outlets.get(r.id) ?? 0
    const dataPlaced = data.get(r.id) ?? 0
    const shortfall = Math.max(0, target - placed)
    const underProvisioned = placed < target
    if (underProvisioned) underProvisionedCount += 1
    totalTarget += target
    totalPlaced += placed
    out.push({
      roomId: r.id,
      roomName: r.name,
      category,
      target,
      placed,
      dataPlaced,
      shortfall,
      underProvisioned,
    })
  }

  return { rooms: out, underProvisionedCount, totalTarget, totalPlaced, dbNote: DB_LOAD_NOTE }
}
