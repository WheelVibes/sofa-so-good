import { FLAT } from './constants';
import type { WallSpec } from './types';

export interface WallSegment {
  /** X-position along the wall axis (start). */
  start: number;
  /** X-position along the wall axis (end). */
  end: number;
  /** Bottom height. */
  bottom: number;
  /** Top height. */
  top: number;
}

/** Returns the solid wall segments to render, given a wall spec. */
export function buildWallSegments(wall: WallSpec, ceilingHeight: number): WallSegment[] {
  const segments: WallSegment[] = [];
  const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const cutouts = [...wall.cutouts].sort((a, b) => a.offset - b.offset);
  const wallTop = wall.topHeight ?? ceilingHeight;

  // Solid spans between cutouts (run up to the wall top — ceiling for normal
  // walls, parapet height for half walls).
  let cursor = 0;
  for (const c of cutouts) {
    if (c.offset > cursor) {
      segments.push({ start: cursor, end: c.offset, bottom: 0, top: wallTop });
    }
    cursor = c.offset + c.width;
  }
  if (cursor < wallLength) {
    segments.push({ start: cursor, end: wallLength, bottom: 0, top: wallTop });
  }

  // Sill below windows
  for (const c of cutouts) {
    if (c.kind === 'window' && c.sill > 0) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: 0, top: Math.min(c.sill, wallTop) });
    }
  }

  // Header above doors and windows (only for full-height walls)
  for (const c of cutouts) {
    if (c.head < wallTop) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: c.head, top: wallTop });
    }
  }

  return segments;
}

export function wallThicknessMetres(wall: WallSpec): number {
  return wall.thickness === 'external' ? FLAT.externalWallThickness : FLAT.internalWallThickness;
}

/** Returns the thickness of the wall that this wall's start/end abuts, or 0
 *  if the endpoint is free (does not lie on any other wall's centerline).
 *  Used for trimming face planes flush to the inner edge of the abutting
 *  wall and extending body boxes to its outer edge. */
export function wallEndAbutmentThickness(wall: WallSpec, allWalls: readonly WallSpec[], atStart: boolean): number {
  const point = atStart ? wall.start : wall.end;
  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const dx = other.end[0] - other.start[0];
    const dz = other.end[1] - other.start[1];
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const tx = dx / len;
    const tz = dz / len;
    const px = point[0] - other.start[0];
    const pz = point[1] - other.start[1];
    const along = px * tx + pz * tz;
    const perp = Math.abs(px * -tz + pz * tx);
    if (perp < 1e-3 && along > -1e-3 && along < len + 1e-3) {
      return wallThicknessMetres(other);
    }
  }
  return 0;
}
