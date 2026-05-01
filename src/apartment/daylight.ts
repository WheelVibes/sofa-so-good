// src/apartment/daylight.ts
import { ROOMS, WALLS, FLAT } from './constants';
import type { RoomId, WallSpec, Vec2 } from './types';

type Vec3 = readonly [number, number, number];

const EPS = 1e-3;

function wallNormalOutward(wall: WallSpec, roomId: RoomId): Vec2 | null {
  const r = ROOMS[roomId];
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.hypot(dx, dz);
  if (len < EPS) return null;
  // Two candidate normals (perpendicular in 2D).
  const nA: Vec2 = [-dz / len, dx / len];
  const nB: Vec2 = [dz / len, -dx / len];
  // Choose the one pointing AWAY from the room centroid.
  const cx = r.origin[0] + r.width / 2;
  const cz = r.origin[1] + r.depth / 2;
  const midX = (sx + ex) / 2;
  const midZ = (sz + ez) / 2;
  const toRoomX = cx - midX;
  const toRoomZ = cz - midZ;
  const pickA = nA[0] * toRoomX + nA[1] * toRoomZ < 0;
  return pickA ? nA : nB;
}

export function wallBordersRoom(wall: WallSpec, roomId: RoomId): boolean {
  // True iff the wall's centerline lies along one of the room's four edges,
  // offset outward by the appropriate wall half-thickness.
  const r = ROOMS[roomId];
  const half =
    wall.thickness === 'external'
      ? FLAT.externalWallThickness / 2
      : FLAT.internalWallThickness / 2;
  const [x0, z0] = r.origin;
  const x1 = x0 + r.width;
  const z1 = z0 + r.depth;
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const horizontal = Math.abs(sz - ez) < EPS;
  const vertical = Math.abs(sx - ex) < EPS;
  if (horizontal) {
    const z = sz;
    const onNorth = Math.abs(z - (z0 - half)) < EPS;
    const onSouth = Math.abs(z - (z1 + half)) < EPS;
    if (!onNorth && !onSouth) return false;
    const lo = Math.min(sx, ex);
    const hi = Math.max(sx, ex);
    return lo <= x1 + EPS && hi >= x0 - EPS;
  }
  if (vertical) {
    const x = sx;
    const onWest = Math.abs(x - (x0 - half)) < EPS;
    const onEast = Math.abs(x - (x1 + half)) < EPS;
    if (!onWest && !onEast) return false;
    const lo = Math.min(sz, ez);
    const hi = Math.max(sz, ez);
    return lo <= z1 + EPS && hi >= z0 - EPS;
  }
  return false;
}

export function roomDaylightFactor(roomId: RoomId, sunDir: Vec3): number {
  if (sunDir[1] <= 0) return 0;
  const room = ROOMS[roomId];
  if (room.external) return 1;

  // Project sun onto XZ plane and normalize.
  const sxz = Math.hypot(sunDir[0], sunDir[2]);
  if (sxz < EPS) {
    // Sun straight up — no horizontal direction; rooms with any window get a
    // small base factor (skylight-equivalent). Keep behavior conservative: 0.
    return 0;
  }
  const sx = sunDir[0] / sxz;
  const sz = sunDir[2] / sxz;

  let sum = 0;
  for (const wall of WALLS) {
    if (!wallBordersRoom(wall, roomId)) continue;
    const windows = wall.cutouts.filter((c) => c.kind === 'window');
    if (windows.length === 0) continue;
    const normal = wallNormalOutward(wall, roomId);
    if (!normal) continue;
    if (normal[0] * sx + normal[1] * sz <= 0) continue;
    const wallLen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const winWidth = windows.reduce((s, c) => s + c.width, 0);
    sum += Math.min(1, winWidth / wallLen);
  }
  return Math.min(1, sum);
}
