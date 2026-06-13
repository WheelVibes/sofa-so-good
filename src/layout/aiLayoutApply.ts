/**
 * Apply AI-proposed placements (PARITY-AILAYOUT) to concrete furniture items.
 *
 * Pure: resolves each placement's target room by name, drops unknown rooms /
 * catalog defs, clamps the position into the room's interior rectangle (so the
 * model can't drop a piece outside its room), and emits a `FurnitureItem` with a
 * fresh id. `placeNonOverlapping` then greedily keeps only the candidates that
 * don't collide with the existing layout or each other (the model's positions
 * are approximate). No three/React/store imports.
 */

import type { AiPlacement } from '../ai/autoLayoutAi'
import { findItemOverlaps } from '../collision/placement'
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

/**
 * Greedily keep the candidate items that don't collide with the existing layout
 * or with already-accepted candidates (the model's positions are approximate, so
 * some overlap). Returns the accepted subset (order preserved). Pure — uses the
 * shared footprint collision test; `noClip` decor never collides.
 */
export function placeNonOverlapping(
  existing: FurnitureItem[],
  candidates: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): FurnitureItem[] {
  const accepted = existing.slice()
  const placed: FurnitureItem[] = []
  for (const c of candidates) {
    if (!defs[c.defId]) continue
    const overlaps = findItemOverlaps([...accepted, c], defs)
    if (overlaps.some((p) => p.a === c.id || p.b === c.id)) continue
    accepted.push(c)
    placed.push(c)
  }
  return placed
}
