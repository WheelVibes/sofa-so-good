/**
 * Door-aware collision walls for the **per-room editor**: built from the
 * isolated room's clipped wall segments (not the whole flat), so a walk-mode
 * player is bounded to the room. Mirrors `buildCollisionWalls` but iterates
 * `roomShell(roomId).walls` and clamps every door cutout to each clipped span.
 */

import { DOORS } from '../apartment/constants';
import { wallThicknessMetres } from '../apartment/wallSegments';
import { roomShell } from '../apartment/roomShell';
import type { RoomId } from '../apartment/types';
import type { CollisionWall } from './walls';

export function buildRoomCollisionWalls(
  roomId: RoomId,
  doorState: Record<string, { open: boolean }>,
): CollisionWall[] {
  const shell = roomShell(roomId);
  const segs: CollisionWall[] = [];

  for (const clip of shell.walls) {
    const wall = clip.spec;
    // Full-wall axis + unit vector (door offsets are measured along this).
    const wdx = wall.end[0] - wall.start[0];
    const wdz = wall.end[1] - wall.start[1];
    const wlen = Math.hypot(wdx, wdz);
    if (wlen === 0) continue;
    const ux = wdx / wlen;
    const uz = wdz / wlen;
    const thickness = wallThicknessMetres(wall);

    // Clipped span expressed as a [t0, t1] range of distance along the wall.
    const t0raw = (clip.start[0] - wall.start[0]) * ux + (clip.start[1] - wall.start[1]) * uz;
    const t1raw = (clip.end[0] - wall.start[0]) * ux + (clip.end[1] - wall.start[1]) * uz;
    const t0 = Math.min(t0raw, t1raw);
    const t1 = Math.max(t0raw, t1raw);

    // Open-door spans on this wall, clamped to the clip range.
    const openSpans: Array<{ start: number; end: number }> = [];
    for (const c of wall.cutouts) {
      if (c.kind !== 'door') continue;
      const door = DOORS.find(
        (d) => d.wallId === wall.id && d.offset === c.offset && d.width === c.width,
      );
      if (!door) continue;
      const isOpen = doorState[door.id]?.open ?? door.defaultOpen;
      if (!isOpen) continue;
      const s = Math.max(c.offset, t0);
      const e = Math.min(c.offset + c.width, t1);
      if (e > s) openSpans.push({ start: s, end: e });
    }
    openSpans.sort((a, b) => a.start - b.start);

    const pointAt = (t: number): [number, number] => [
      wall.start[0] + ux * t,
      wall.start[1] + uz * t,
    ];

    // Walk the clip range, emitting solid sub-segments between open doors.
    let cursor = t0;
    for (const span of openSpans) {
      if (span.start > cursor) {
        const [ax, az] = pointAt(cursor);
        const [bx, bz] = pointAt(span.start);
        segs.push({ ax, az, bx, bz, thickness });
      }
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < t1) {
      const [ax, az] = pointAt(cursor);
      const [bx, bz] = pointAt(t1);
      segs.push({ ax, az, bx, bz, thickness });
    }
  }

  return segs;
}
