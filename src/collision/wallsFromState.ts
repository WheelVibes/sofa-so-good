/**
 * Builds the door-aware collision wall segments for a given doors-state
 * snapshot. Shared by the first-person camera and placement collision
 * so both paths see the same "what is solid right now?" view.
 */

import { DOORS, WALLS } from '../apartment/constants';
import type { CollisionWall } from './walls';

export function buildCollisionWalls(
  doorState: Record<string, { open: boolean }>,
): CollisionWall[] {
  const segs: CollisionWall[] = [];
  for (const wall of WALLS) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const ux = dx / length;
    const uz = dz / length;

    const openSpans: Array<{ start: number; end: number }> = [];
    for (const c of wall.cutouts) {
      if (c.kind !== 'door') continue;
      const door = DOORS.find(
        (d) => d.wallId === wall.id && d.offset === c.offset && d.width === c.width,
      );
      if (!door) continue;
      const isOpen = doorState[door.id]?.open ?? door.defaultOpen;
      if (isOpen) openSpans.push({ start: c.offset, end: c.offset + c.width });
    }
    openSpans.sort((a, b) => a.start - b.start);

    const pointAt = (t: number): [number, number] => [
      wall.start[0] + ux * t,
      wall.start[1] + uz * t,
    ];

    let cursor = 0;
    for (const span of openSpans) {
      if (span.start > cursor) {
        const [ax, az] = pointAt(cursor);
        const [bx, bz] = pointAt(span.start);
        segs.push({ ax, az, bx, bz });
      }
      cursor = span.end;
    }
    if (cursor < length) {
      const [ax, az] = pointAt(cursor);
      const [bx, bz] = pointAt(length);
      segs.push({ ax, az, bx, bz });
    }
  }
  return segs;
}
