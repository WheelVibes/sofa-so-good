import type { FurnitureItem } from '../furniture/types'

/**
 * Reflect a furniture item left↔right across the vertical world line `x = cx`.
 * A true mirror needs three things: the position X reflects, the Y-heading
 * negates (rotation about Y flips sign under an X reflection), and the piece's
 * own geometry mirrors (`flipX` toggles) so asymmetric items — an L-desk, a
 * chaise sofa — read as their mirror image rather than just turning around.
 * `z`, props, and everything else are preserved.
 */
export function mirrorItemX(item: FurnitureItem, cx: number): FurnitureItem {
  return {
    ...item,
    position: [2 * cx - item.position[0], item.position[1]],
    rotation: -item.rotation,
    flipX: !item.flipX,
  }
}

/**
 * Mirror a set of items across `x = cx`, but only keep a mirrored item if it's
 * still a valid placement (`isValid`) — so an asymmetric room (a door on one
 * side) can't push furniture through a wall. Items that wouldn't fit stay where
 * they are. Returns the new full `items` array plus how many were mirrored.
 */
export function mirrorRoomItems(
  items: FurnitureItem[],
  idsInRoom: Set<string>,
  cx: number,
  isValid: (mirrored: FurnitureItem) => boolean,
): { items: FurnitureItem[]; mirrored: number } {
  let mirrored = 0
  const next = items.map((it) => {
    if (!idsInRoom.has(it.id) || it.locked) return it
    const m = mirrorItemX(it, cx)
    if (!isValid(m)) return it
    mirrored += 1
    return m
  })
  return { items: next, mirrored }
}
