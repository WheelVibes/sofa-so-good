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

  // Solid spans between cutouts (full height)
  let cursor = 0;
  for (const c of cutouts) {
    if (c.offset > cursor) {
      segments.push({ start: cursor, end: c.offset, bottom: 0, top: ceilingHeight });
    }
    cursor = c.offset + c.width;
  }
  if (cursor < wallLength) {
    segments.push({ start: cursor, end: wallLength, bottom: 0, top: ceilingHeight });
  }

  // Sill below windows
  for (const c of cutouts) {
    if (c.kind === 'window' && c.sill > 0) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: 0, top: c.sill });
    }
  }

  // Header above doors and windows
  for (const c of cutouts) {
    if (c.head < ceilingHeight) {
      segments.push({ start: c.offset, end: c.offset + c.width, bottom: c.head, top: ceilingHeight });
    }
  }

  return segments;
}

export function wallThicknessMetres(wall: WallSpec): number {
  return wall.thickness === 'external' ? FLAT.externalWallThickness : FLAT.internalWallThickness;
}
