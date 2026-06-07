/**
 * Pure aggregations for the printable design report. Kept separate from the
 * HTML builder so the number-crunching is unit-testable without DOM/string
 * assertions.
 */
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'

export interface RoomCost {
  name: string
  count: number
  total: number
}

/** Estimated unit price of a placed item (respects the active IKEA variant). */
export function lineEach(item: FurnitureItem, def: FurnitureDef): number {
  const variant = typeof item.props['variant'] === 'string' ? item.props['variant'] : undefined
  return itemPrice(def, def.category, variant)
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
