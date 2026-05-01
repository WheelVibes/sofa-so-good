import { describe, it, expect } from 'vitest';
import {
  generateBuildings,
  BUILDING_COUNT,
  DEFAULT_SEED,
  R_MIN,
  R_MAX,
  APARTMENT_SAFETY_MARGIN,
  apartmentCentroid,
} from './buildings';
import { ROOMS } from '../../apartment/constants';

function aabb(b: ReturnType<typeof generateBuildings>[number], cx: number, cz: number) {
  const ax = cx + b.position[0];
  const az = cz + b.position[1];
  return {
    minX: ax - b.width / 2,
    maxX: ax + b.width / 2,
    minZ: az - b.depth / 2,
    maxZ: az + b.depth / 2,
  };
}

describe('generateBuildings', () => {
  it('is deterministic for the same seed', () => {
    const a = generateBuildings(123);
    const b = generateBuildings(123);
    expect(a).toEqual(b);
  });

  it('produces different layouts for different seeds', () => {
    const a = generateBuildings(123);
    const b = generateBuildings(124);
    expect(a).not.toEqual(b);
  });

  it('returns up to BUILDING_COUNT buildings', () => {
    const out = generateBuildings(DEFAULT_SEED);
    expect(out.length).toBeGreaterThan(BUILDING_COUNT * 0.7);
    expect(out.length).toBeLessThanOrEqual(BUILDING_COUNT);
  });

  it('respects width/depth/height ranges', () => {
    for (const b of generateBuildings(DEFAULT_SEED)) {
      expect(b.width).toBeGreaterThanOrEqual(12);
      expect(b.width).toBeLessThanOrEqual(24);
      expect(b.depth).toBeGreaterThanOrEqual(12);
      expect(b.depth).toBeLessThanOrEqual(24);
      expect(b.height).toBeGreaterThanOrEqual(18);
      expect(b.height).toBeLessThanOrEqual(60);
      expect(b.shade).toBeGreaterThanOrEqual(0.78);
      expect(b.shade).toBeLessThanOrEqual(1.0);
    }
  });

  it('every building lies outside the apartment safety margin', () => {
    const [cx, cz] = apartmentCentroid();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of Object.values(ROOMS)) {
      minX = Math.min(minX, r.origin[0]);
      maxX = Math.max(maxX, r.origin[0] + r.width);
      minZ = Math.min(minZ, r.origin[1]);
      maxZ = Math.max(maxZ, r.origin[1] + r.depth);
    }
    const inflated = {
      minX: minX - APARTMENT_SAFETY_MARGIN,
      maxX: maxX + APARTMENT_SAFETY_MARGIN,
      minZ: minZ - APARTMENT_SAFETY_MARGIN,
      maxZ: maxZ + APARTMENT_SAFETY_MARGIN,
    };
    for (const b of generateBuildings(DEFAULT_SEED)) {
      const ab = aabb(b, cx, cz);
      const overlaps = !(
        ab.maxX < inflated.minX ||
        ab.minX > inflated.maxX ||
        ab.maxZ < inflated.minZ ||
        ab.minZ > inflated.maxZ
      );
      expect(overlaps).toBe(false);
    }
  });

  it('keeps building centres inside the [R_MIN-pad, R_MAX+pad] ring', () => {
    for (const b of generateBuildings(DEFAULT_SEED)) {
      const r = Math.hypot(b.position[0], b.position[1]);
      expect(r).toBeGreaterThanOrEqual(R_MIN - 1);
      expect(r).toBeLessThanOrEqual(R_MAX + 1);
    }
  });
});
