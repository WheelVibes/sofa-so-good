/**
 * Apply AI-proposed placements (PARITY-AILAYOUT) to concrete furniture items.
 *
 * Pure: resolves each placement's target room by name, drops unknown rooms /
 * catalog defs, clamps the position into the room's interior rectangle (so the
 * model can't drop a piece outside its room), and emits a `FurnitureItem` with a
 * fresh id. Collision-free arrangement is left to the user / auto-arrange — this
 * just guarantees valid, in-room placements. No three/React/store imports.
 */

import type { AiPlacement } from '../ai/autoLayoutAi'
import { allPlanRooms } from '../floorplan/levels'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../furniture/types'

/** Clamp `v` into `[lo, hi]` (tolerant of inverted bounds). */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(Math.min(lo, hi), Math.min(v, Math.max(lo, hi)))
}

/**
 * Convert validated placements to furniture items. `genId` supplies fresh ids.
 * A placement is dropped when its room name or `defId` is unknown. The position
 * is clamped to the room's interior rect (with a small inset so pieces don't sit
 * exactly on a wall).
 */
export function aiLayoutToItems(
  placements: AiPlacement[],
  plan: FloorPlan,
  catalog: Record<string, FurnitureDef>,
  genId: (prefix: string) => string,
): FurnitureItem[] {
  const rooms = new Map(allPlanRooms(plan).map((r) => [r.name, r]))
  const items: FurnitureItem[] = []
  for (const p of placements) {
    const room = rooms.get(p.room)
    if (!room || !catalog[p.defId]) continue
    const inset = 0.3
    const x = clamp(p.x, room.origin[0] + inset, room.origin[0] + room.width - inset)
    const z = clamp(p.z, room.origin[1] + inset, room.origin[1] + room.depth - inset)
    items.push({
      id: genId('ai'),
      defId: p.defId as FurnitureType,
      position: [x, z],
      rotation: Number.isFinite(p.rotation) ? p.rotation : 0,
      props: {},
    })
  }
  return items
}
