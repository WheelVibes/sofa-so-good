/** The minimal room-shell shape the furniture room-filter needs: a containment
 *  test. Both the default-apartment `RoomShell` and the plan-based
 *  `PlanRoomShell` satisfy it, so `FurnitureLayer` works in either per-room
 *  editor without depending on a concrete shell type. */
export interface RoomContainment {
  contains: (x: number, z: number) => boolean
}

/** An item is "in" a room when its footprint center [x, z] lies inside the
 *  room (with the shell's tolerance). Minimal shape so callers can pass a full
 *  FurnitureItem or a test stub. */
export function isItemInRoom(
  item: { position: readonly [number, number] },
  shell: RoomContainment,
): boolean {
  return shell.contains(item.position[0], item.position[1])
}
