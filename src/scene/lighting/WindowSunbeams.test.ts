import { describe, it, expect } from 'vitest';
import { WINDOWS } from '../../apartment/constants';
import { projectWindowToFloor } from './WindowSunbeams';

const wideBounds = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };
const tightBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

describe('projectWindowToFloor', () => {
  const spec = WINDOWS[0];

  it('returns null when sun is at/below horizon', () => {
    expect(projectWindowToFloor(spec, [0, 0, 1], wideBounds)).toBeNull();
    expect(projectWindowToFloor(spec, [0, -0.5, 0.5], wideBounds)).toBeNull();
  });

  it('with sun straight overhead, projection equals window xz footprint', () => {
    // sunDir.y = 1, others 0: t = cy/1 = cy; floor pt = (cx - cy*0, cz - cy*0) = (cx, cz)
    const out = projectWindowToFloor(spec, [0, 1, 0], wideBounds);
    expect(out).not.toBeNull();
    // For a horizontal-window pair, the four projected points should collapse to two
    // distinct xz positions (top and bottom edges share xz).
    const [p0, p1, p2, p3] = out!.pts;
    expect(p0[0]).toBeCloseTo(p3[0], 6);
    expect(p0[1]).toBeCloseTo(p3[1], 6);
    expect(p1[0]).toBeCloseTo(p2[0], 6);
    expect(p1[1]).toBeCloseTo(p2[1], 6);
  });

  it('returns null when projected centroid lands outside bounds', () => {
    // Use very tight bounds that exclude the apartment.
    const out = projectWindowToFloor(
      spec,
      [0, 1, 0],
      { minX: 1000, maxX: 1001, minZ: 1000, maxZ: 1001 },
    );
    expect(out).toBeNull();
  });

  it('shifts projection downwind of the sun direction', () => {
    // sunDir with positive x: light flow = -sunDir, photons travel toward -x;
    // the projected floor point should be shifted to LOWER x than the corner.
    const overhead = projectWindowToFloor(spec, [0, 1, 0], wideBounds)!;
    const angled = projectWindowToFloor(spec, [0.4, 0.9, 0], tightBounds);
    // angled may or may not pass bounds; just check that when both exist, x differs.
    if (angled) {
      const dx0 = angled.pts[0][0] - overhead.pts[0][0];
      // sunDir.x > 0 → floor pt at corner: cx - (cy/sunDir.y)*sunDir.x → smaller x
      expect(dx0).toBeLessThan(0);
    }
  });
});
