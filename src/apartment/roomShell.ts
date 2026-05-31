import { ROOMS, WALLS, WINDOWS, DOORS } from './constants';
import type { RoomDef, RoomId, WallSpec, WindowSpec, DoorSpec } from './types';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A wall segment trimmed to the span that bounds the room. Shared long walls
 *  (e.g. the full north wall over all three bedrooms) are clipped so only the
 *  portion adjacent to the isolated room renders. */
export interface ClippedWall {
  /** Source wall id (multiple clips can share an id — keyed separately). */
  wallId: string;
  start: [number, number];
  end: [number, number];
  spec: WallSpec;
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

/** For an axis-aligned wall on a rect edge, the sub-segment overlapping that
 *  rect's extent along the wall axis. Returns null when the wall isn't on any
 *  edge of the rects, or the overlap is degenerate. A wall on a SHARED edge
 *  (long span over several rooms) is clipped to the room's footprint here. */
function clipWallToRects(
  wall: WallSpec,
  rects: Rect[],
): { start: [number, number]; end: [number, number] } | null {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const horizontal = Math.abs(sz - ez) < EDGE_EPS;
  const vertical = Math.abs(sx - ex) < EDGE_EPS;
  if (!horizontal && !vertical) return null;

  let best: { start: [number, number]; end: [number, number]; len: number } | null = null;
  for (const r of rects) {
    if (horizontal) {
      const onEdge = Math.abs(sz - r.z0) < EDGE_EPS || Math.abs(sz - r.z1) < EDGE_EPS;
      if (!onEdge) continue;
      const lo = Math.max(Math.min(sx, ex), r.x0);
      const hi = Math.min(Math.max(sx, ex), r.x1);
      const len = hi - lo;
      if (len > EDGE_EPS && (!best || len > best.len)) {
        best = { start: [lo, sz], end: [hi, sz], len };
      }
    }
    if (vertical) {
      const onEdge = Math.abs(sx - r.x0) < EDGE_EPS || Math.abs(sx - r.x1) < EDGE_EPS;
      if (!onEdge) continue;
      const lo = Math.max(Math.min(sz, ez), r.z0);
      const hi = Math.min(Math.max(sz, ez), r.z1);
      const len = hi - lo;
      if (len > EDGE_EPS && (!best || len > best.len)) {
        best = { start: [sx, lo], end: [sx, hi], len };
      }
    }
  }
  return best ? { start: best.start, end: best.end } : null;
}

/** World [x, z] center of an opening (window/door) along its parent wall. */
function openingCenter(
  spec: WindowSpec | DoorSpec,
  wall: WallSpec,
): [number, number] | null {
  const wdx = wall.end[0] - wall.start[0];
  const wdz = wall.end[1] - wall.start[1];
  const len = Math.hypot(wdx, wdz);
  if (len < 1e-6) return null;
  const ux = wdx / len;
  const uz = wdz / len;
  const at = spec.offset + spec.width / 2;
  return [wall.start[0] + ux * at, wall.start[1] + uz * at];
}

/** True when point p lies within the clipped span [a,b] (inclusive, tol). */
function pointOnSpan(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): boolean {
  const minX = Math.min(a[0], b[0]) - POINT_EPS;
  const maxX = Math.max(a[0], b[0]) + POINT_EPS;
  const minZ = Math.min(a[1], b[1]) - POINT_EPS;
  const maxZ = Math.max(a[1], b[1]) + POINT_EPS;
  return p[0] >= minX && p[0] <= maxX && p[1] >= minZ && p[1] <= maxZ;
}

export interface RoomShell {
  roomId: RoomId;
  rects: Rect[];
  /** Wall segments clipped to the room footprint (shared walls trimmed). */
  walls: ClippedWall[];
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

  const walls: ClippedWall[] = [];
  for (const w of WALLS) {
    const clip = clipWallToRects(w, rects);
    if (clip) walls.push({ wallId: w.id, start: clip.start, end: clip.end, spec: w });
  }

  // An opening belongs to the room when its parent wall is a room wall AND its
  // world position lies within that wall's clipped span — so a shared wall's
  // far-room windows/doors are excluded.
  const wallById = new Map(walls.map((cw) => [cw.wallId, cw]));
  const windowIds: string[] = [];
  for (const win of WINDOWS) {
    const cw = wallById.get(win.wallId);
    if (!cw) continue;
    const c = openingCenter(win, cw.spec);
    if (c && pointOnSpan(c, cw.start, cw.end)) windowIds.push(win.id);
  }
  const doorIds: string[] = [];
  for (const d of DOORS) {
    const cw = wallById.get(d.wallId);
    if (!cw) continue;
    const c = openingCenter(d, cw.spec);
    if (c && pointOnSpan(c, cw.start, cw.end)) doorIds.push(d.id);
  }

  const x0 = Math.min(...rects.map((r) => r.x0));
  const z0 = Math.min(...rects.map((r) => r.z0));
  const x1 = Math.max(...rects.map((r) => r.x1));
  const z1 = Math.max(...rects.map((r) => r.z1));
  const center: [number, number] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2;

  return {
    roomId,
    rects,
    walls,
    windowIds,
    doorIds,
    center,
    radius,
    contains: (x, z) => pointInRects(x, z, rects),
  };
}
