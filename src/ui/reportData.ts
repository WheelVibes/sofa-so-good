/**
 * Pure aggregations for the printable design report. Kept separate from the
 * HTML builder so the number-crunching is unit-testable without DOM/string
 * assertions.
 */
import { ROOMS } from '../apartment/constants'
import { type FloorPlan, planRoomArea, planRoomPerimeter, pointInRoom } from '../floorplan/types'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'

export interface FinishArea {
  id: string
  area: number
}

/**
 * Total floor area (m²) per floor finish across the plan's non-external rooms —
 * the "how much flooring to order" procurement view (distinct from the per-room
 * finishes table). Pure; sorted by area desc, ids resolved to names by the
 * caller. Rooms with no floor finish set are skipped.
 */
export function floorAreaByFinish(
  plan: FloorPlan,
  floor: Record<string, string> | undefined,
): FinishArea[] {
  if (!floor) return []
  const byFinish = new Map<string, number>()
  for (const room of plan.rooms) {
    if (ROOMS[room.id as keyof typeof ROOMS]?.external) continue
    const id = floor[room.id]
    if (!id) continue
    byFinish.set(id, (byFinish.get(id) ?? 0) + planRoomArea(room))
  }
  return [...byFinish.entries()].map(([id, area]) => ({ id, area })).sort((a, b) => b.area - a.area)
}

/**
 * Gross wall area per wall finish (m²) — perimeter × ceiling height per room,
 * grouped by the room's wall finish. The procurement counterpart to the flooring
 * schedule (how much paint/tile to order). Gross (door/window openings not
 * deducted), which is the safe over-order estimate.
 */
export function wallAreaByFinish(
  plan: FloorPlan,
  walls: Record<string, string> | undefined,
  defaultHeight: number,
): FinishArea[] {
  if (!walls) return []
  const byFinish = new Map<string, number>()
  for (const room of plan.rooms) {
    if (ROOMS[room.id as keyof typeof ROOMS]?.external) continue
    const id = walls[room.id]
    if (!id) continue
    const h = room.ceilingHeight ?? defaultHeight
    byFinish.set(id, (byFinish.get(id) ?? 0) + planRoomPerimeter(room) * h)
  }
  return [...byFinish.entries()].map(([id, area]) => ({ id, area })).sort((a, b) => b.area - a.area)
}

export interface RoomCost {
  name: string
  count: number
  total: number
}

/** Estimated unit price of a placed item (respects the active IKEA variant). */
export function lineEach(item: FurnitureItem, def: FurnitureDef): number {
  const variant = typeof item.props['variant'] === 'string' ? item.props['variant'] : undefined
  return itemPrice(def, def.category, variant, item.meta?.price)
}

/**
 * Attribute each placed item to the first plan room whose footprint contains its
 * centre, summing item count + estimated cost per room. Items outside every room
 * land in an "Unassigned" bucket (appended only when non-empty). Rooms with no
 * items are omitted; rooms are returned in plan order, Unassigned last.
 */
export function furnitureCostByRoom(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): RoomCost[] {
  const byRoom = new Map<string, RoomCost>()
  const unassigned: RoomCost = { name: 'Unassigned', count: 0, total: 0 }
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const each = lineEach(it, def)
    const room = plan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (room) {
      const e = byRoom.get(room.id) ?? { name: room.name, count: 0, total: 0 }
      e.count += 1
      e.total += each
      byRoom.set(room.id, e)
    } else {
      unassigned.count += 1
      unassigned.total += each
    }
  }
  const rows = plan.rooms.filter((r) => byRoom.has(r.id)).map((r) => byRoom.get(r.id)!)
  if (unassigned.count > 0) rows.push(unassigned)
  return rows
}

interface RoomItemLine {
  defId: string
  name: string
  count: number
  /** Estimated unit price (SGD). */
  each: number
}

export interface RoomItems {
  name: string
  count: number
  total: number
  /** Interior floor area (m²); 0 for the Unassigned bucket. */
  area: number
  /** The room's furniture grouped by type (+ variant), priciest line first. */
  lines: RoomItemLine[]
}

/**
 * Itemised furniture breakdown per room: each room with the pieces inside it
 * (grouped by def + IKEA variant, with quantity + estimated line cost), priciest
 * first, plus the room's item count + total. Items outside every room go to an
 * "Unassigned" bucket (appended only when non-empty); empty rooms are omitted;
 * rooms returned in plan order. The room-by-room view a furnishing quote/handoff
 * wants ("what goes in the bedroom"). Per-room totals match `furnitureCostByRoom`.
 */
export function furnitureItemsByRoom(
  plan: FloorPlan,
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): RoomItems[] {
  type Bucket = { name: string; lines: Map<string, RoomItemLine> }
  const byRoom = new Map<string, Bucket>()
  const unassigned: Bucket = { name: 'Unassigned', lines: new Map() }
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const each = lineEach(it, def)
    const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
    const key = variant ? `${it.defId}::${variant}` : it.defId
    const room = plan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    const bucket = room
      ? (byRoom.get(room.id) ?? { name: room.name, lines: new Map() })
      : unassigned
    if (room) byRoom.set(room.id, bucket)
    const line = bucket.lines.get(key) ?? { defId: it.defId, name: def.name, count: 0, each }
    line.count += 1
    bucket.lines.set(key, line)
  }
  const build = (b: Bucket, area: number): RoomItems => {
    const lines = [...b.lines.values()].sort(
      (a, z) => z.each * z.count - a.each * a.count || a.name.localeCompare(z.name),
    )
    return {
      name: b.name,
      count: lines.reduce((s, l) => s + l.count, 0),
      total: lines.reduce((s, l) => s + l.each * l.count, 0),
      area,
      lines,
    }
  }
  const rows = plan.rooms
    .filter((r) => byRoom.has(r.id))
    .map((r) => build(byRoom.get(r.id)!, planRoomArea(r)))
  if (unassigned.lines.size > 0) rows.push(build(unassigned, 0))
  return rows
}

export interface PaletteSwatch {
  id: string
  name: string
  /** A hex/CSS colour for the chip. */
  swatch: string
  /** How many surfaces (floors + walls across rooms) use this finish. */
  count: number
}

/** Floor + wall finish ids per room (the store's `finishes` slice shape). */
export interface FinishesByRoom {
  floor: Record<string, string>
  walls: Record<string, string>
}

/**
 * The design's material palette: the distinct floor + wall finishes in use,
 * resolved to a friendly name + a chip colour, ordered by how many surfaces use
 * each (most-used first), then by name for stable ties. A custom-colour finish
 * (`#rrggbb`) is its own swatch; a builtin material resolves via the catalog;
 * an unknown id (DLC/remote) falls back to a neutral chip but is still listed so
 * the palette is complete. Pure — feeds the report's "style board" section.
 */
export function designPalette(finishes: FinishesByRoom | undefined): PaletteSwatch[] {
  if (!finishes) return []
  const counts = new Map<string, number>()
  for (const id of [...Object.values(finishes.floor), ...Object.values(finishes.walls)]) {
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const resolve = (id: string): { name: string; swatch: string } => {
    if (id.startsWith('#')) return { name: id.toUpperCase(), swatch: id }
    const m = BUILTIN_MATERIALS[id]
    if (m) return { name: m.name, swatch: m.swatch }
    return { name: id, swatch: '#cccccc' }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, ...resolve(id) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
