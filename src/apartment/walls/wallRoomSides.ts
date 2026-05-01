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
    for (const e of r.extensions ?? []) {
      out.push({
        roomId: id,
        x0: r.origin[0] + e.offset[0],
        z0: r.origin[1] + e.offset[1],
        x1: r.origin[0] + e.offset[0] + e.width,
        z1: r.origin[1] + e.offset[1] + e.depth,
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

/** Returns the rooms adjacent to a wall's two interior faces, sampled at
 *  a given offset along the wall axis (start → end). When omitted, samples
 *  at the wall midpoint — but walls that span multiple rooms (e.g. a
 *  shared south wall covering bath2 + service yard + household shelter)
 *  must sample per render-segment, since each segment's interior face
 *  belongs to a different room. */
export function wallRoomSidesAt(wall: WallSpec, axisOffset: number): WallSides {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  if (length === 0) return { positive: null, negative: null };
  const tx = dx / length;
  const tz = dz / length;
  // Local +Z perpendicular in world = (-dz/L, dx/L) — wall's "left".
  const nx = -tz;
  const nz = tx;
  const px = wall.start[0] + tx * axisOffset;
  const pz = wall.start[1] + tz * axisOffset;
  const off = wallThicknessMetres(wall) / 2 + SAMPLE_EPSILON;
  return {
    positive: roomAt(px + nx * off, pz + nz * off),
    negative: roomAt(px - nx * off, pz - nz * off),
  };
}

/** Returns the rooms adjacent to a wall's two interior faces, sampled at
 *  the wall midpoint. Use `wallRoomSidesAt` for per-segment accuracy. */
export function wallRoomSides(wall: WallSpec): WallSides {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  return wallRoomSidesAt(wall, length / 2);
}

export interface WallSidesSpan extends WallSides {
  /** Axis offset (start) along the wall. */
  start: number;
  /** Axis offset (end) along the wall. */
  end: number;
}

/** Returns axis spans [start, end] along the wall over which (positive,
 *  negative) sides are constant — i.e. each span is backed by a single
 *  room on each side. Spans are derived by projecting every interior
 *  room rectangle's edges onto the wall axis and using those as candidate
 *  split points; the side rooms are then sampled at each span midpoint. */
export function wallSidesSpans(wall: WallSpec, axisStart: number, axisEnd: number): WallSidesSpan[] {
  if (axisEnd <= axisStart) return [];
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  if (length === 0) return [];
  const tx = dx / length;
  const tz = dz / length;

  // Projected split candidates: each interior room rectangle contributes
  // up to two boundary crossings on this wall axis. Solve for axisOffset
  // where start + t*axisOffset crosses each rect edge.
  const candidates = new Set<number>();
  candidates.add(axisStart);
  candidates.add(axisEnd);
  const sx = wall.start[0];
  const sz = wall.start[1];
  for (const r of RECTS) {
    if (Math.abs(tx) > 1e-9) {
      candidates.add((r.x0 - sx) / tx);
      candidates.add((r.x1 - sx) / tx);
    }
    if (Math.abs(tz) > 1e-9) {
      candidates.add((r.z0 - sz) / tz);
      candidates.add((r.z1 - sz) / tz);
    }
  }
  const splits = [...candidates]
    .filter((v) => v > axisStart + 1e-6 && v < axisEnd - 1e-6)
    .sort((a, b) => a - b);
  const breakpoints = [axisStart, ...splits, axisEnd];

  const spans: WallSidesSpan[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    if (b - a < 1e-6) continue;
    const sides = wallRoomSidesAt(wall, (a + b) / 2);
    const last = spans[spans.length - 1];
    if (last && last.positive === sides.positive && last.negative === sides.negative) {
      last.end = b;
    } else {
      spans.push({ start: a, end: b, positive: sides.positive, negative: sides.negative });
    }
  }
  return spans;
}
