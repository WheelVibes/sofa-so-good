import { allPlanRooms, roomAtItem } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import { itemPrice } from './furniturePrices'
import type { FurnitureDef, FurnitureItem } from './types'

export interface RoomSpendRow {
  name: string
  amt: number
  count: number
}

/**
 * Estimated furniture spend grouped by which room each item sits in (via
 * `roomAtItem`, so an item counts toward a room on its own storey), highest
 * first. Covers EVERY storey. Items outside every room fall under "Outside
 * rooms". Estimate‑based (`itemPrice`) so the rows always sum to the estimated
 * total. Pure — powers the Budget panel's "Spend by room" breakdown.
 */
export function spendByRoom(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  plan: FloorPlan,
): { rows: RoomSpendRow[]; sum: number } {
  // EVERY storey (F13), and attributed via `roomAtItem` so an item is credited
  // to a room on its OWN floor — a bare `pointInRoom` over a flat room list
  // would file an upstairs piece into whatever room sits beneath it.
  const rooms = allPlanRooms(plan)
  const agg = new Map<string, { amt: number; count: number }>()
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const variant = typeof it.props.variant === 'string' ? it.props.variant : undefined
    const each = itemPrice(def, def.category, variant, it.meta?.price)
    const room = roomAtItem(plan, it)
    const key = room?.id ?? '__none'
    const cur = agg.get(key) ?? { amt: 0, count: 0 }
    agg.set(key, { amt: cur.amt + each, count: cur.count + 1 })
  }
  const rows = [...agg.entries()]
    .map(([id, v]) => ({
      name: id === '__none' ? 'Outside rooms' : (rooms.find((r) => r.id === id)?.name ?? id),
      amt: v.amt,
      count: v.count,
    }))
    .sort((a, b) => b.amt - a.amt)
  return { rows, sum: rows.reduce((s, r) => s + r.amt, 0) }
}
