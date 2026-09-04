import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { FurnitureItem } from '../furniture/types'

/**
 * Swap two rooms' furniture by translation: items in room A shift by `(dx, dz)`
 * (A→B), items in room B shift by the opposite (B→A). `(dx, dz)` is the
 * room-centre delta `B.centre − A.centre`. Everything else is preserved, so each
 * room's arrangement is reproduced verbatim in the other room. Pure — the caller
 * supplies the id sets + does collision-checking + commit.
 *
 * **The level ids swap too (F13, v0.31.9.5)**, for the same reason as
 * `cloneRoomItems`: this used to spread `...it` and move only `position`, so
 * swapping a ground-floor room with an upstairs one moved both arrangements in
 * plan XZ and left both on their original storeys. Pass the two rooms' level ids
 * and each side lands on the other's; omit them for a same-storey swap, which is
 * the common case and unchanged.
 */
export function swapRoomLayouts(
  items: FurnitureItem[],
  aIds: Set<string>,
  bIds: Set<string>,
  dx: number,
  dz: number,
  aLevelId?: string,
  bLevelId?: string,
): FurnitureItem[] {
  const onLevel = (it: FurnitureItem, levelId: string | undefined): FurnitureItem => {
    if (levelId === undefined) return it
    if (levelId === GROUND_LEVEL_ID) {
      const { levelId: _ground, ...onGround } = it
      return onGround as FurnitureItem
    }
    return { ...it, levelId }
  }
  return items.map((it) => {
    // A's items take B's storey and vice versa — the arrangement moves, so the
    // storey it lives on has to move with it.
    if (aIds.has(it.id)) {
      return onLevel(
        { ...it, position: [it.position[0] + dx, it.position[1] + dz] as [number, number] },
        bLevelId,
      )
    }
    if (bIds.has(it.id)) {
      return onLevel(
        { ...it, position: [it.position[0] - dx, it.position[1] - dz] as [number, number] },
        aLevelId,
      )
    }
    return it
  })
}
