/** The minimal room-shell shape the furniture room-filter needs: a containment
 *  test. Both the default-apartment `RoomShell` and the plan-based
 *  `PlanRoomShell` satisfy it, so `FurnitureLayer` works in either per-room
 *  editor without depending on a concrete shell type. */
export interface RoomContainment {
  contains: (x: number, z: number) => boolean
  /** The storey the room lives on; absent = ground (default-flat shells). */
  levelId?: string
}

/** An item is "in" a room when its footprint center [x, z] lies inside the
 *  room (with the shell's tolerance). Minimal shape so callers can pass a full
 *  FurnitureItem or a test stub. */
export function isItemInRoom(
  item: { position: readonly [number, number]; levelId?: string },
  shell: RoomContainment,
): boolean {
  // Same storey first (F13/ML5) — an upstairs room at the same XZ as a ground
  // room must not pick up the ground room's furniture (and vice versa).
  if ((item.levelId ?? 'ground') !== (shell.levelId ?? 'ground')) return false
  return shell.contains(item.position[0], item.position[1])
}
