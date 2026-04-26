/**
 * Computes the room-id on each side of every wall (the +Z side and -Z
 * side in the wall's local frame, where +X = wall direction). Used by
 * the per-room WallSegment renderer to apply each adjacent room's
 * wall finish to the correct interior face.
 *
 * Sides are computed once at module load by point-in-polygon against
 * the room rectangles (including extensions for L-shaped rooms),
 * sampling the wall's midpoint offset by half-thickness + epsilon
 * along the local ±Z normal.
 *
 * Returns null for a side that is external (outside any room) — the
 * caller skips rendering an interior face there.
 */

import { ROOMS } from '../constants';
import { wallThicknessMetres } from '../wallSegments';
import type { RoomId } from '../types';
import type { WallSpec } from '../types';

const SAMPLE_EPSILON = 0.05;

interface Rect {
  roomId: RoomId;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const RECTS: Rect[] = (() => {
  const out: Rect[] = [];
  for (const id of Object.keys(ROOMS) as RoomId[]) {
    const r = ROOMS[id];
    if (r.external) continue;
    out.push({
      roomId: id,
      x0: r.origin[0],
      z0: r.origin[1],
      x1: r.origin[0] + r.width,
      z1: r.origin[1] + r.depth,
    });
    if (r.extension) {
      out.push({
        roomId: id,
        x0: r.origin[0] + r.extension.offset[0],
        z0: r.origin[1] + r.extension.offset[1],
        x1: r.origin[0] + r.extension.offset[0] + r.extension.width,
        z1: r.origin[1] + r.extension.offset[1] + r.extension.depth,
      });
    }
  }
  return out;
})();

function roomAt(x: number, z: number): RoomId | null {
  for (const r of RECTS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.roomId;
  }
  return null;
}

export interface WallSides {
  /** Room on the +Z side of the wall in its local frame
   *  (left when looking along start → end). */
  positive: RoomId | null;
  /** Room on the -Z side of the wall in its local frame. */
  negative: RoomId | null;
}

/** Returns the rooms adjacent to a wall's two interior faces. */
export function wallRoomSides(wall: WallSpec): WallSides {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  if (length === 0) return { positive: null, negative: null };
  // Local +Z perpendicular in world = (-dz/L, dx/L) — wall's "left".
  const nx = -dz / length;
  const nz = dx / length;
  const mx = (wall.start[0] + wall.end[0]) / 2;
  const mz = (wall.start[1] + wall.end[1]) / 2;
  const off = wallThicknessMetres(wall) / 2 + SAMPLE_EPSILON;
  return {
    positive: roomAt(mx + nx * off, mz + nz * off),
    negative: roomAt(mx - nx * off, mz - nz * off),
  };
}
