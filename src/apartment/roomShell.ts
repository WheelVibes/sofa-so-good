import { ROOMS, WALLS, WINDOWS, DOORS } from './constants';
import type { RoomDef, RoomId } from './types';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// Interior rect edges sit inside the wall centerlines by half the wall
// thickness (external 0.2 → 0.1; internal 0.1 → 0.05). The collinearity
// tolerance must bridge that gap to match a room edge to its wall, while
// staying well under the smallest room dimension so it never grabs the
// opposite parallel wall. 0.16 covers half an external wall plus margin.
const EDGE_EPS = 0.16; // wall-on-edge collinearity (spans wall half-thickness)
const POINT_EPS = 0.06; // point-in-room containment tolerance

/** One or two axis-aligned interior rects covering the room (main + extension). */
export function roomRects(room: RoomDef): Rect[] {
  const rects: Rect[] = [
    {
      x0: room.origin[0],
      z0: room.origin[1],
      x1: room.origin[0] + room.width,
      z1: room.origin[1] + room.depth,
    },
  ];
  if (room.extension) {
    const ox = room.origin[0] + room.extension.offset[0];
    const oz = room.origin[1] + room.extension.offset[1];
    rects.push({ x0: ox, z0: oz, x1: ox + room.extension.width, z1: oz + room.extension.depth });
  }
  return rects;
}

function pointInRects(x: number, z: number, rects: Rect[]): boolean {
  return rects.some(
    (r) =>
      x >= r.x0 - POINT_EPS &&
      x <= r.x1 + POINT_EPS &&
      z >= r.z0 - POINT_EPS &&
      z <= r.z1 + POINT_EPS,
  );
}

/** True when a wall segment lies on the perimeter of any of the room's rects:
 *  it must be axis-aligned, sit on a rect edge line, and overlap that edge. */
function wallOnRoomEdge(
  start: readonly [number, number],
  end: readonly [number, number],
  rects: Rect[],
): boolean {
  const [sx, sz] = start;
  const [ex, ez] = end;
  const horizontal = Math.abs(sz - ez) < EDGE_EPS;
  const vertical = Math.abs(sx - ex) < EDGE_EPS;
  if (!horizontal && !vertical) return false;
  for (const r of rects) {
    if (horizontal) {
      const onEdge = Math.abs(sz - r.z0) < EDGE_EPS || Math.abs(sz - r.z1) < EDGE_EPS;
      const lo = Math.min(sx, ex);
      const hi = Math.max(sx, ex);
      const overlaps = Math.min(hi, r.x1) - Math.max(lo, r.x0) > EDGE_EPS;
      if (onEdge && overlaps) return true;
    }
    if (vertical) {
      const onEdge = Math.abs(sx - r.x0) < EDGE_EPS || Math.abs(sx - r.x1) < EDGE_EPS;
      const lo = Math.min(sz, ez);
      const hi = Math.max(sz, ez);
      const overlaps = Math.min(hi, r.z1) - Math.max(lo, r.z0) > EDGE_EPS;
      if (onEdge && overlaps) return true;
    }
  }
  return false;
}

export interface RoomShell {
  roomId: RoomId;
  rects: Rect[];
  wallIds: string[];
  windowIds: string[];
  doorIds: string[];
  /** Center of the bounding box over all rects, as [x, z]. */
  center: [number, number];
  /** Half-diagonal of the bounding box (camera framing radius). */
  radius: number;
  /** Whether an [x, z] point lies inside the room (with tolerance). */
  contains: (x: number, z: number) => boolean;
}

export function roomShell(roomId: RoomId): RoomShell {
  const room = ROOMS[roomId];
  const rects = roomRects(room);
  const walls = WALLS.filter((w) => wallOnRoomEdge(w.start, w.end, rects));
  const wallIds = walls.map((w) => w.id);
  // Windows/doors belong to the room when their parent wall is a room wall.
  const windowIds = WINDOWS.filter((win) => wallIds.includes(win.wallId)).map((w) => w.id);
  const doorIds = DOORS.filter((d) => wallIds.includes(d.wallId)).map((d) => d.id);

  const x0 = Math.min(...rects.map((r) => r.x0));
  const z0 = Math.min(...rects.map((r) => r.z0));
  const x1 = Math.max(...rects.map((r) => r.x1));
  const z1 = Math.max(...rects.map((r) => r.z1));
  const center: [number, number] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2;

  return {
    roomId,
    rects,
    wallIds,
    windowIds,
    doorIds,
    center,
    radius,
    contains: (x, z) => pointInRects(x, z, rects),
  };
}
