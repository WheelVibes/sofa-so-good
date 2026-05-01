import { describe, it, expect } from 'vitest';
import { ROOMS, WALLS, DOORS, WINDOWS, INTERIOR_AREA_M2 } from './constants';

describe('apartment constants', () => {
  it('total internal area is within 0.5 m² of 89 (excluding AC ledge)', () => {
    // Strata interior excludes only the AC ledge (external annex south of bath1).
    // Service yard is counted as interior, including its small enclosed strip
    // west of the SY-W partition. The earlier ≈ 90 m² target counted L/D as
    // a single 4.00 × 5.40 rectangle that swallowed the b3↔L/D wall body
    // (cx=[8.55, 9.10] cz=[1.40, 3.65], 0.55 × 2.25 = 1.24 m²); modelling
    // L/D as its true L-shape (south arm + narrower north arm + SE alcove)
    // drops that over-counted slice and lands at ≈ 89 m².
    const sum = Object.values(ROOMS)
      .filter((r) => !r.external)
      .reduce((acc, r) => {
        const main = r.width * r.depth;
        const ext = (r.extensions ?? []).reduce(
          (a, e) => a + e.width * e.depth,
          0,
        );
        return acc + main + ext;
      }, 0);
    expect(Math.abs(sum - 89)).toBeLessThan(0.5);
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

  it("L/D's three sub-rectangles align with the surrounding walls", () => {
    // Spatial-consistency anchor: a sofa placed in any L/D sub-rect
    // should see free wall-to-wall space matching that sub-rect's
    // dimensions, not the room's bounding box. The earlier model
    // declared a single 4.00 × 5.40 m main rectangle whose north end
    // overlapped the b3↔L/D wall body, so a 2.16 m sofa placed in the
    // bedroom-band end of L/D had ~1.29 m wall-to-wall free space
    // instead of the 1.84 m the 4.00 m label implied.
    const ld = ROOMS.livingDining;
    expect(ld.origin).toEqual([8.55, 3.65]);
    expect(ld.width).toBeCloseTo(4.0, 5);
    expect(ld.depth).toBeCloseTo(3.15, 5);
    expect(ld.extensions ?? []).toHaveLength(2);
    const [northArm, alcove] = ld.extensions!;
    expect(northArm.width).toBeCloseTo(3.45, 5);
    expect(northArm.depth).toBeCloseTo(2.25, 5);
    // North arm's west boundary is the b3↔L/D partition's interior
    // face: centerline cx=9.05 + half-thickness 0.05 = 9.10.
    expect(ld.origin[0] + northArm.offset[0]).toBeCloseTo(9.1, 5);
    expect(ld.origin[1] + northArm.offset[1]).toBeCloseTo(1.4, 5);
    expect(alcove.width).toBeCloseTo(2.45, 5);
    expect(alcove.depth).toBeCloseTo(1.1, 5);
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
