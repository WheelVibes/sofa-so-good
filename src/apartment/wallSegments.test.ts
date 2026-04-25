import { describe, it, expect } from 'vitest';
import { buildWallSegments } from './wallSegments';
import type { WallSpec } from './types';

const ceiling = 2.6;

describe('buildWallSegments', () => {
  it('returns one full-height segment for a wall with no cutouts', () => {
    const wall: WallSpec = { id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal', cutouts: [] };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toEqual([{ start: 0, end: 4, bottom: 0, top: ceiling }]);
  });

  it('splits around a door and adds a header above it', () => {
    const wall: WallSpec = {
      id: 'w', start: [0, 0], end: [4, 0], thickness: 'internal',
      cutouts: [{ kind: 'door', offset: 1, width: 0.8, sill: 0, head: 2.1 }],
    };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toContainEqual({ start: 0, end: 1, bottom: 0, top: ceiling });
    expect(seg).toContainEqual({ start: 1.8, end: 4, bottom: 0, top: ceiling });
    expect(seg).toContainEqual({ start: 1, end: 1.8, bottom: 2.1, top: ceiling });
  });

  it('emits sill below a window plus header above', () => {
    const wall: WallSpec = {
      id: 'w', start: [0, 0], end: [4, 0], thickness: 'external',
      cutouts: [{ kind: 'window', offset: 1, width: 1.5, sill: 0.95, head: 2.1 }],
    };
    const seg = buildWallSegments(wall, ceiling);
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 0, top: 0.95 });
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 2.1, top: ceiling });
  });
});
