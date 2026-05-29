/**
 * Shared per-wall reveal opacity, written by WallSegment each frame and read
 * by Windows/Doors so they hide together with their host wall during the
 * camera-reveal fade (they render outside the wall group). Missing entries
 * (e.g. internal walls, which never fade) default to fully visible.
 */
const wallOpacity = new Map<string, number>();

export function setWallOpacity(wallId: string, opacity: number): void {
  wallOpacity.set(wallId, opacity);
}

export function getWallOpacity(wallId: string): number {
  return wallOpacity.get(wallId) ?? 1;
}
