import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { FurnitureItem } from '../furniture/types'

/**
 * Clone a set of furniture items by a world translation `(dx, dz)` — for copying
 * one room's arrangement into another (e.g. identical bedrooms). Each clone gets
 * a fresh id; shared groups are remapped consistently (a copied group stays a
 * group, but distinct from the original). Rotation/flip/props are preserved, so
 * the arrangement is reproduced verbatim, just shifted. Pure — the caller does
 * collision-checking + commit.
 *
 * **`targetLevelId` moves the copy BETWEEN STOREYS (F13, v0.31.9.5).** The
 * caller (`FinishPicker`'s "copy layout to…") lists its targets with
 * `allPlanRooms`, i.e. every storey — and this used to spread `...it`, carrying
 * the SOURCE's `levelId`. Copying a ground-floor bedroom into an upstairs
 * bedroom therefore produced furniture at the upstairs room's plan XZ but still
 * on the ground floor, so it landed in whatever is below. Plan coordinates are
 * shared across storeys (elevation only offsets rendering), which is exactly why
 * the translation looked right and the result was not.
 *
 * Absent/ground target clears `levelId` rather than storing `'ground'`, matching
 * the codebase convention that absent means ground.
 */
export function cloneRoomItems(
  items: FurnitureItem[],
  dx: number,
  dz: number,
  makeId: () => string,
  targetLevelId?: string,
): FurnitureItem[] {
  const groupRemap = new Map<string, string>()
  return items.map((it) => {
    let groupId = it.groupId
    if (groupId) {
      const mapped = groupRemap.get(groupId) ?? makeId()
      groupRemap.set(groupId, mapped)
      groupId = mapped
    }
    const clone: FurnitureItem = {
      ...it,
      id: makeId(),
      position: [it.position[0] + dx, it.position[1] + dz] as [number, number],
      groupId,
    }
    if (targetLevelId === undefined) return clone
    if (targetLevelId === GROUND_LEVEL_ID) {
      const { levelId: _ground, ...onGround } = clone
      return onGround as FurnitureItem
    }
    return { ...clone, levelId: targetLevelId }
  })
}
