import { describe, it, expect } from 'vitest';
import { nearestWallGap } from './clearanceGap';
import type { CollisionWall } from './walls';

// A 4×3 m room: walls at x=0, x=4 (vertical) and z=0, z=3 (horizontal), 0.1 thick.
const room: CollisionWall[] = [
  { ax: 0, az: 0, bx: 0, bz: 3, thickness: 0.1 },
  { ax: 4, az: 0, bx: 4, bz: 3, thickness: 0.1 },
  { ax: 0, az: 0, bx: 4, bz: 0, thickness: 0.1 },
  { ax: 0, az: 3, bx: 4, bz: 3, thickness: 0.1 },
];

describe('nearestWallGap', () => {
  it('measures the gap to the closest wall face', () => {
    // Item 1×1 centred at (1, 1.5): edges at x0=0.5; west wall face at x=0.05.
    const gap = nearestWallGap({ x0: 0.5, z0: 1.0, x1: 1.5, z1: 2.0 }, room);
    expect(gap).toBeCloseTo(0.45, 5); // 0.5 - 0.05
  });

  it('returns 0 when flush against a wall', () => {
    const gap = nearestWallGap({ x0: 0.05, z0: 1.0, x1: 1.05, z1: 2.0 }, room);
    expect(gap).toBe(0);
  });

  it('returns null with no facing walls', () => {
    expect(nearestWallGap({ x0: 0.5, z0: 1, x1: 1.5, z1: 2 }, [])).toBeNull();
  });
});
