import type { RoomShell } from '../apartment/roomShell';

/** An item is "in" a room when its footprint center [x, z] lies inside the
 *  room's rects (with the shell's tolerance). Minimal shape so callers can
 *  pass a full FurnitureItem or a test stub. */
export function isItemInRoom(
  item: { position: readonly [number, number] },
  shell: RoomShell,
): boolean {
  return shell.contains(item.position[0], item.position[1]);
}
