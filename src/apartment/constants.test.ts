import { describe, it, expect } from 'vitest';
import { ROOMS, WALLS, DOORS, WINDOWS, INTERIOR_AREA_M2 } from './constants';

describe('apartment constants', () => {
  it('total internal area is within 0.5 m² of 90', () => {
    const sum = Object.values(ROOMS)
      .filter((r) => !r.external)
      .reduce((acc, r) => {
        const main = r.width * r.depth;
        const ext = r.extension ? r.extension.width * r.extension.depth : 0;
        return acc + main + ext;
      }, 0);
    expect(Math.abs(sum - 90)).toBeLessThan(0.5);
    expect(Math.abs(INTERIOR_AREA_M2 - sum)).toBeLessThan(0.01);
  });

  it('every door references an existing wall', () => {
    const wallIds = new Set(WALLS.map((w) => w.id));
    for (const d of DOORS) expect(wallIds.has(d.wallId)).toBe(true);
  });

  it('every window references an existing wall', () => {
    const wallIds = new Set(WALLS.map((w) => w.id));
    for (const w of WINDOWS) expect(wallIds.has(w.wallId)).toBe(true);
  });

  it('every door cutout exists on its wall', () => {
    for (const d of DOORS) {
      const wall = WALLS.find((w) => w.id === d.wallId)!;
      const matching = wall.cutouts.find(
        (c) =>
          c.kind === 'door' &&
          Math.abs(c.offset - d.offset) < 0.001 &&
          Math.abs(c.width - d.width) < 0.001,
      );
      expect(matching, `door ${d.id} has no matching cutout on ${d.wallId}`).toBeDefined();
    }
  });

  it('every window cutout exists on its wall', () => {
    for (const w of WINDOWS) {
      const wall = WALLS.find((x) => x.id === w.wallId)!;
      const matching = wall.cutouts.find(
        (c) =>
          c.kind === 'window' &&
          Math.abs(c.offset - w.offset) < 0.001 &&
          Math.abs(c.width - w.width) < 0.001,
      );
      expect(matching, `window ${w.id} has no matching cutout on ${w.wallId}`).toBeDefined();
    }
  });
});
