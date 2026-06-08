import type { FurnitureItem } from '../furniture/types'

/**
 * Clone a set of furniture items by a world translation `(dx, dz)` — for copying
 * one room's arrangement into another (e.g. identical bedrooms). Each clone gets
 * a fresh id; shared groups are remapped consistently (a copied group stays a
 * group, but distinct from the original). Rotation/flip/props are preserved, so
 * the arrangement is reproduced verbatim, just shifted. Pure — the caller does
 * collision-checking + commit.
 */
export function cloneRoomItems(
  items: FurnitureItem[],
  dx: number,
  dz: number,
  makeId: () => string,
): FurnitureItem[] {
  const groupRemap = new Map<string, string>()
  return items.map((it) => {
    let groupId = it.groupId
    if (groupId) {
      const mapped = groupRemap.get(groupId) ?? makeId()
      groupRemap.set(groupId, mapped)
      groupId = mapped
    }
    return {
      ...it,
      id: makeId(),
      position: [it.position[0] + dx, it.position[1] + dz] as [number, number],
      groupId,
    }
  })
}
