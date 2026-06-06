/**
 * Pure aggregations for the printable design report. Kept separate from the
 * HTML builder so the number-crunching is unit-testable without DOM/string
 * assertions.
 */
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import { itemPrice } from '../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

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
