import { describe, it, expect } from 'vitest';
import { WALLS } from '../constants';
import { wallRoomSides } from './wallRoomSides';

describe('wallRoomSides', () => {
  it('every internal partition has at least one adjacent room', () => {
    for (const wall of WALLS) {
      if (wall.thickness !== 'internal') continue;
      const sides = wallRoomSides(wall);
      expect(sides.positive ?? sides.negative).not.toBeNull();
    }
  });

  it('every external wall has at most one interior side', () => {
    for (const wall of WALLS) {
      if (wall.thickness !== 'external') continue;
      const sides = wallRoomSides(wall);
      const internalSides = [sides.positive, sides.negative].filter(Boolean);
      expect(internalSides.length).toBeLessThanOrEqual(1);
    }
  });

  it('the bedroom-S internal partition separates corridor from a bedroom', () => {
    const wall = WALLS.find((w) => w.id === 'wall-int-bedroom-S');
    expect(wall).toBeDefined();
    const sides = wallRoomSides(wall!);
    const adj = new Set([sides.positive, sides.negative].filter(Boolean));
    expect(adj.has('corridor')).toBe(true);
  });
});
