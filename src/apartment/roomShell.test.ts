import { describe, expect, it } from 'vitest';
import { roomShell, roomRects } from './roomShell';
import { ROOMS } from './constants';

describe('roomRects', () => {
  it('returns one rect for a plain rectangular room', () => {
    const rects = roomRects(ROOMS.bedroom2);
    expect(rects).toHaveLength(1);
    // bedroom2 interior origin [3.15,0.20], 2.85 x 3.40
    expect(rects[0]).toMatchObject({ x0: 3.15, z0: 0.2 });
    expect(rects[0].x1).toBeCloseTo(6.0, 5);
    expect(rects[0].z1).toBeCloseTo(3.6, 5);
  });

  it('returns two rects for an L-shaped room with an extension', () => {
    const rects = roomRects(ROOMS.mainBedroom);
    expect(rects).toHaveLength(2);
  });
});

describe('roomShell', () => {
  it('includes the room north wall for a north-band bedroom', () => {
    const shell = roomShell('bedroom2');
    expect(shell.wallIds).toContain('wall-ext-N');
    expect(shell.rects.length).toBeGreaterThan(0);
  });

  it('contains a point inside the room and rejects one outside', () => {
    const shell = roomShell('bedroom2');
    expect(shell.contains(4.5, 1.5)).toBe(true); // inside B2
    expect(shell.contains(11.0, 7.0)).toBe(false); // far away in kitchen/LD
  });
});
