/**
 * Electrical points schedule (PARITY-ELECTRICAL-SCHED) — the pure data core.
 *
 * A consolidated, room-by-room count of the two rough quantities an electrician
 * quotes against early in a renovation:
 *   - **Lighting points** — ceiling lights, lamps, sconces, fans, cove strips:
 *     anything that emits light. Reuses the SAME light-emitter detection the
 *     reflected-ceiling lighting plan uses (`isItemEmitter`), so a fixture that
 *     shows on the lighting plan also counts here as a lighting point.
 *   - **Power points (13 A sockets)** — inferred from the *powered* furniture
 *     categories present in each room (kitchen appliances, media/electronics,
 *     laundry, white goods, …). Each powered piece maps to an indicative socket
 *     count via {@link SOCKETS_PER_CATEGORY}; non-powered pieces (a sofa, a rug)
 *     contribute nothing.
 *
 * This is an **indicative planning aid**, not a certified electrical layout — it
 * has no notion of circuits, dedicated radials, RCD/MCB sizing, cable runs or SP
 * load schedules. It just gives a contractor a rough socket/point count per room
 * to price against, the way Coohom / Planner-5D surface a points tally.
 *
 * Pure + deterministic (same input → same output), no DOM/React/three. Reuses
 * `allPlanRooms` / `pointInRoom` / `roomKindFromName` and each item's catalog
 * category — the report (and a future CSV) render it.
 */
import { allPlanRooms } from '../floorplan/levels'
import { electricalMountDefaultMm } from '../floorplan/mepPoints'
import { type FloorPlan, type PlanElectricalPoint, pointInRoom } from '../floorplan/types'
import { isItemEmitter } from '../furniture/lightEmitters'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { type RoomKind, roomKindFromName } from './suggestions'

/**
 * Indicative socket count contributed by ONE placed piece of each powered
 * furniture category. Categories absent from this map are treated as drawing no
 * power (seating, tables, beds, storage, decor, textiles, outdoor, kids, …).
 *
 * The numbers are deliberately coarse — a kitchen appliance or white good wants
 * its own dedicated outlet; media/electronics gear clusters around a TV wall;
 * lighting is counted as *lighting points*, not sockets, so the `lighting`
 * category is intentionally NOT here.
 */
export const SOCKETS_PER_CATEGORY: Partial<Record<FurnitureCategory, number>> = {
  kitchen: 2, // hob/oven/built-ins + a counter convenience point
  appliances: 1, // fridge, microwave, range hood, dishwasher, …
  electronics: 1, // TV, monitor, soundbar, speakers, aquarium pump, …
  laundry: 1, // washer / dryer
  others: 1, // generic powered miscellany (conservative)
}

/** A minimum number of power points per habitable room, so even a furnished
 *  bedroom with no powered pieces still reads as needing a couple of outlets
 *  (bedside / general use) — the way an electrician would never wire a room
 *  with zero sockets. Service / external spaces get none. */
export const MIN_SOCKETS_BY_KIND: Partial<Record<RoomKind, number>> = {
  living: 4,
  dining: 2,
  bedroom: 2,
  kitchen: 4,
  study: 3,
  bath: 1,
  other: 1,
}

/** Per-room line in the schedule. */
interface ElectricalRoomRow {
  roomId: string
  roomName: string
  kind: RoomKind
  /** Light fixtures (emitters) whose footprint centre lands in this room. */
  lightingPoints: number
  /** Indicative 13 A socket count inferred from powered items + a per-kind floor. */
  powerPoints: number
  /** lightingPoints + powerPoints. */
  total: number
}

export interface ElectricalSchedule {
  rooms: ElectricalRoomRow[]
  /** Sum of every room's lighting points (incl. unassigned). */
  totalLighting: number
  /** Sum of every room's power points (incl. unassigned). */
  totalPower: number
  /** Grand total of all points. */
  total: number
}

/** Whether a placed item is a light fixture — reuses the lighting-plan emitter
 *  detection so the two reports never disagree about what a "light" is. */
export function isLightingPoint(item: FurnitureItem): boolean {
  return isItemEmitter(item.defId, item.props)
}

/** Indicative sockets a single powered item of `category` contributes. */
export function socketsForCategory(category: FurnitureCategory): number {
  return SOCKETS_PER_CATEGORY[category] ?? 0
}

interface Tally {
  lighting: number
  power: number
}

/**
 * Build the indicative electrical-points schedule for a plan + its placed items.
 *
 * Each item is attributed to the room (across all storeys) whose footprint it
 * sits in; items outside every room collect under a synthetic "Unassigned" row.
 * A light emitter adds a lighting point; a powered category adds its socket
 * quota. Each habitable room is then floored to a sensible minimum socket count
 * (`MIN_SOCKETS_BY_KIND`) so a sparsely-powered room still reads as wired.
 *
 * Pure + deterministic. An empty plan (no rooms, no items) yields an all-zero
 * schedule with no rows (never NaN). Room order follows `allPlanRooms`, with the
 * Unassigned bucket last.
 */
export function buildElectricalSchedule(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): ElectricalSchedule {
  const rooms = allPlanRooms(plan)
  const tally = new Map<string, Tally>()
  const get = (id: string): Tally => {
    let t = tally.get(id)
    if (!t) {
      t = { lighting: 0, power: 0 }
      tally.set(id, t)
    }
    return t
  }

  const UNASSIGNED = ' unassigned'
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    // Attribute to the first room (any storey) the item's centre lands in.
    const room = rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    const t = get(room?.id ?? UNASSIGNED)
    if (isLightingPoint(it)) t.lighting += 1
    t.power += socketsForCategory(def.category)
  }

  const out: ElectricalRoomRow[] = []
  let totalLighting = 0
  let totalPower = 0

  for (const r of rooms) {
    const t = tally.get(r.id) ?? { lighting: 0, power: 0 }
    const kind = roomKindFromName(r.name)
    // Floor habitable rooms to a baseline socket count; never below the inferred.
    const power = Math.max(t.power, MIN_SOCKETS_BY_KIND[kind] ?? 0)
    const row: ElectricalRoomRow = {
      roomId: r.id,
      roomName: r.name,
      kind,
      lightingPoints: t.lighting,
      powerPoints: power,
      total: t.lighting + power,
    }
    // Skip rooms with nothing at all to show (no lights, no inferred/floor power).
    if (row.lightingPoints === 0 && row.powerPoints === 0) continue
    out.push(row)
    totalLighting += row.lightingPoints
    totalPower += row.powerPoints
  }

  // Items that fell outside every room — show them so their points aren't lost.
  const un = tally.get(UNASSIGNED)
  if (un && (un.lighting > 0 || un.power > 0)) {
    out.push({
      roomId: '',
      roomName: 'Unassigned',
      kind: 'other',
      lightingPoints: un.lighting,
      powerPoints: un.power,
      total: un.lighting + un.power,
    })
    totalLighting += un.lighting
    totalPower += un.power
  }

  return {
    rooms: out,
    totalLighting,
    totalPower,
    total: totalLighting + totalPower,
  }
}

/** Per-room line in the DESIGNED-points schedule (H-D3). */
export interface DesignedElectricalRoomRow {
  roomId: string
  roomName: string
  count: number
}

/** One distinct mount height among the designed points, with how many points
 *  sit at it — summarized ("300mm × 18, 1200mm × 4") rather than listing every
 *  point individually. */
export interface DesignedElectricalHeightRow {
  heightMm: number
  count: number
}

export interface DesignedElectricalSchedule {
  rooms: DesignedElectricalRoomRow[]
  total: number
  heights: DesignedElectricalHeightRow[]
}

/**
 * Build the "as designed" electrical-points schedule from the user's own
 * PERSISTED MEP points (H-D3 fix) — the same points the drawing set's
 * electrical sheet plots (`openDrawingSet.ts`), so the report and the drawing
 * set never contradict each other with two different point counts. Unlike
 * {@link buildElectricalSchedule} (a furniture-derived heuristic used only
 * when nothing's been authored yet), this has no lighting/power split — a
 * designed point already carries its own `kind` — just a per-room point count
 * + a summary of the mount heights present (falling back to each kind's
 * default height when a point has none, same as the exported sheet's `@mm`
 * suffix logic conceptually implies).
 *
 * Pure + deterministic. Room attribution mirrors `buildElectricalSchedule`
 * (first room across all storeys whose footprint contains the point;
 * unattributed points collect under a synthetic "Unassigned" row).
 */
export function buildDesignedElectricalSchedule(
  plan: FloorPlan,
  points: PlanElectricalPoint[],
): DesignedElectricalSchedule {
  const rooms = allPlanRooms(plan)
  const tally = new Map<string, number>()
  const heightTally = new Map<number, number>()
  const UNASSIGNED = ' unassigned'

  for (const p of points) {
    const room = rooms.find((r) => pointInRoom(r, p.x, p.z))
    const id = room?.id ?? UNASSIGNED
    tally.set(id, (tally.get(id) ?? 0) + 1)
    const h = Math.round(p.mountHeightMm ?? electricalMountDefaultMm(p.kind))
    heightTally.set(h, (heightTally.get(h) ?? 0) + 1)
  }

  const out: DesignedElectricalRoomRow[] = []
  let total = 0
  for (const r of rooms) {
    const count = tally.get(r.id) ?? 0
    if (count === 0) continue
    out.push({ roomId: r.id, roomName: r.name, count })
    total += count
  }
  const un = tally.get(UNASSIGNED)
  if (un) {
    out.push({ roomId: '', roomName: 'Unassigned', count: un })
    total += un
  }

  const heights = [...heightTally.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([heightMm, count]) => ({ heightMm, count }))

  return { rooms: out, total, heights }
}
