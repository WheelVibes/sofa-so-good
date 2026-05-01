import { ROOMS } from '../constants';
import type { RoomDef, RoomId } from '../types';

export interface FloorRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function roomRects(r: RoomDef): FloorRect[] {
  const main: FloorRect = {
    x0: r.origin[0],
    z0: r.origin[1],
    x1: r.origin[0] + r.width,
    z1: r.origin[1] + r.depth,
  };
  const exts = (r.extensions ?? []).map((e) => ({
    x0: r.origin[0] + e.offset[0],
    z0: r.origin[1] + e.offset[1],
    x1: r.origin[0] + e.offset[0] + e.width,
    z1: r.origin[1] + e.offset[1] + e.depth,
  }));
  return [main, ...exts];
}

function rectArea(r: FloorRect): number {
  return (r.x1 - r.x0) * (r.z1 - r.z0);
}

/** Splits `a` into the sub-rects covering `a \ b`. Up to 4 axis-aligned
 *  sub-rects (returns `[a]` when there's no overlap). */
function rectMinus(a: FloorRect, b: FloorRect): FloorRect[] {
  const ix0 = Math.max(a.x0, b.x0);
  const iz0 = Math.max(a.z0, b.z0);
  const ix1 = Math.min(a.x1, b.x1);
  const iz1 = Math.min(a.z1, b.z1);
  const eps = 1e-6;
  if (ix0 >= ix1 - eps || iz0 >= iz1 - eps) return [a];
  const out: FloorRect[] = [];
  if (a.x0 < ix0 - eps) out.push({ x0: a.x0, z0: a.z0, x1: ix0, z1: a.z1 });
  if (a.x1 > ix1 + eps) out.push({ x0: ix1, z0: a.z0, x1: a.x1, z1: a.z1 });
  if (a.z0 < iz0 - eps) out.push({ x0: ix0, z0: a.z0, x1: ix1, z1: iz0 });
  if (a.z1 > iz1 + eps) out.push({ x0: ix0, z0: iz1, x1: ix1, z1: a.z1 });
  return out;
}

/** Returns the non-overlapping floor rects each interior room should render.
 *  Where two room rectangles overlap (e.g. livingDining's NW corner reaches
 *  into bedroom3 and the corridor in the source data), the smaller-area
 *  room wins so the more specific room's finish is the one that paints
 *  the overlap region. ROOMS-iteration order is the deterministic
 *  tiebreaker for equal-area rooms. External rooms are skipped. */
export function computeRoomFloorRects(): Record<RoomId, FloorRect[]> {
  const ids = (Object.keys(ROOMS) as RoomId[]).filter((id) => !ROOMS[id].external);
  const allRects: { roomId: RoomId; rect: FloorRect; area: number; order: number }[] = [];
  ids.forEach((id, order) => {
    for (const rect of roomRects(ROOMS[id])) {
      allRects.push({ roomId: id, rect, area: rectArea(rect), order });
    }
  });

  const out = {} as Record<RoomId, FloorRect[]>;
  for (const id of ids) out[id] = [];

  for (const entry of allRects) {
    let pieces: FloorRect[] = [entry.rect];
    for (const other of allRects) {
      if (other === entry) continue;
      // `other` wins if it has smaller area, or equal area + earlier order.
      const otherWins =
        other.area < entry.area - 1e-9 ||
        (Math.abs(other.area - entry.area) < 1e-9 && other.order < entry.order);
      if (!otherWins) continue;
      const next: FloorRect[] = [];
      for (const p of pieces) next.push(...rectMinus(p, other.rect));
      pieces = next;
      if (pieces.length === 0) break;
    }
    out[entry.roomId].push(...pieces);
  }
  return out;
}
