import { describe, it, expect } from 'vitest';
import { kelvinToRGB } from './colorTemp';

function close(a: number, b: number, tol = 0.06) { return Math.abs(a - b) <= tol; }

describe('kelvinToRGB', () => {
  it('returns warm orange at 2200 K (R > G > B)', () => {
    const [r, g, b] = kelvinToRGB(2200);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeCloseTo(1, 1);
  });
  it('returns roughly white at ~5500 K', () => {
    const [r, g, b] = kelvinToRGB(5500);
    expect(close(r, g, 0.08)).toBe(true);
    expect(close(g, b, 0.15)).toBe(true);
  });
  it('returns cool blue-tinted at 6500 K (B >= G)', () => {
    const [r, g, b] = kelvinToRGB(6500);
    expect(b).toBeGreaterThanOrEqual(g - 0.02);
    expect(r).toBeLessThanOrEqual(1);
  });
  it('clamps below 1000 K and above 12000 K', () => {
    expect(() => kelvinToRGB(500)).not.toThrow();
    expect(() => kelvinToRGB(20000)).not.toThrow();
    const low = kelvinToRGB(500);
    const high = kelvinToRGB(20000);
    for (const v of [...low, ...high]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
