import type { FurnitureItem } from '../furniture/types'

/**
 * Swap two rooms' furniture by translation: items in room A shift by `(dx, dz)`
 * (A→B), items in room B shift by the opposite (B→A). `(dx, dz)` is the
 * room-centre delta `B.centre − A.centre`. Everything else is preserved, so each
 * room's arrangement is reproduced verbatim in the other room. Pure — the caller
 * supplies the id sets + does collision-checking + commit.
 */
export function swapRoomLayouts(
  items: FurnitureItem[],
  aIds: Set<string>,
  bIds: Set<string>,
  dx: number,
  dz: number,
): FurnitureItem[] {
  return items.map((it) => {
    if (aIds.has(it.id)) return { ...it, position: [it.position[0] + dx, it.position[1] + dz] }
    if (bIds.has(it.id)) return { ...it, position: [it.position[0] - dx, it.position[1] - dz] }
    return it
  })
}
