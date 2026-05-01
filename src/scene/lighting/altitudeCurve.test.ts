import { describe, it, expect } from 'vitest';
import { lightingFromAltitude, skyFromAltitude, daylightAdmittance } from './altitudeCurve';

const DEG = Math.PI / 180;

describe('lightingFromAltitude', () => {
  it('mid-overhead (alt = 30°) returns the daytime baseline', () => {
    const v = lightingFromAltitude(30 * DEG);
    expect(v.sun).toBeCloseTo(1.0, 2);
    expect(v.ambient).toBeCloseTo(0.28, 2);
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2);
    expect(v.sunColor[1]).toBeCloseTo(0.96, 2);
    expect(v.sunColor[2]).toBeCloseTo(0.88, 2);
    expect(v.exposure).toBeCloseTo(1.0, 2);
    expect(v.envIntensity).toBeCloseTo(0.45, 2);
  });

  it('zenith (Singapore noon, alt ≥ 80°) lifts exposure and ambient above the daytime baseline', () => {
    const v = lightingFromAltitude(85 * DEG);
    expect(v.sun).toBeGreaterThan(1.0);
    expect(v.ambient).toBeGreaterThan(0.28);
    expect(v.exposure).toBeGreaterThan(1.0);
  });

  it('horizon (alt = 0) returns deep-golden values with most direct sun gone', () => {
    const v = lightingFromAltitude(0);
    expect(v.sun).toBeLessThan(0.2);
    expect(v.ambient).toBeLessThan(0.3);
    expect(v.sunColor[0]).toBeCloseTo(1.0, 2);
    expect(v.sunColor[1]).toBeLessThan(0.7);
    expect(v.sunColor[2]).toBeLessThan(0.5);
  });

  it('an hour before sunset (alt ≈ 15°) is dimmer and warmer than the midday baseline', () => {
    const noon = lightingFromAltitude(30 * DEG);
    const v = lightingFromAltitude(15 * DEG);
    expect(v.sun).toBeLessThan(noon.sun * 0.7);
    expect(v.exposure).toBeLessThan(noon.exposure);
    // Warmer = less blue.
    expect(v.sunColor[2]).toBeLessThan(noon.sunColor[2]);
  });

  it('golden hour (alt ≈ 6°) is markedly dimmer and warmer still', () => {
    const v = lightingFromAltitude(6 * DEG);
    expect(v.sun).toBeLessThan(0.4);
    expect(v.sunColor[1]).toBeLessThan(0.85);
    expect(v.sunColor[2]).toBeLessThan(0.65);
  });

  it('civil twilight (alt = -6°) returns dim dusk values', () => {
    const v = lightingFromAltitude(-6 * DEG);
    expect(v.sun).toBeLessThan(0.05);
    expect(v.ambient).toBeLessThan(0.2);
  });

  it('deep night (alt ≤ -12°) returns night floor', () => {
    const v = lightingFromAltitude(-30 * DEG);
    expect(v.sun).toBeCloseTo(0, 2);
    expect(v.ambient).toBeCloseTo(0.06, 2);
  });

  it('linearly interpolates between adjacent keyframes', () => {
    // Halfway between alt=0° and alt=6°.
    const v = lightingFromAltitude(3 * DEG);
    const lo = lightingFromAltitude(0);
    const hi = lightingFromAltitude(6 * DEG);
    expect(v.sun).toBeCloseTo((lo.sun + hi.sun) / 2, 3);
  });

  it('clamps at the high end (alt > 80°)', () => {
    const a = lightingFromAltitude(89 * DEG);
    const b = lightingFromAltitude(80 * DEG);
    expect(a.sun).toBeCloseTo(b.sun, 5);
    expect(a.ambient).toBeCloseTo(b.ambient, 5);
  });

  it('attenuates IBL envIntensity at deep night so dark rooms stay dark', () => {
    const v = lightingFromAltitude(-30 * DEG);
    expect(v.envIntensity).toBeLessThan(0.2);
  });
});

describe('skyFromAltitude', () => {
  it('produces day-like sky parameters at high altitude', () => {
    const v = skyFromAltitude(45 * DEG);
    // Tropics baseline turbidity is in [6, 8] across daytime altitudes.
    expect(v.turbidity).toBeGreaterThanOrEqual(6);
    expect(v.turbidity).toBeLessThanOrEqual(8);
    expect(v.rayleigh).toBeCloseTo(1, 1);
  });

  it('produces dusk-like sky parameters near the horizon', () => {
    const v = skyFromAltitude(0);
    expect(v.turbidity).toBeGreaterThan(6);
    expect(v.rayleigh).toBeGreaterThan(2);
  });

  it('produces night sky parameters when sun is well below horizon', () => {
    const v = skyFromAltitude(-30 * DEG);
    expect(v.turbidity).toBeCloseTo(10, 1);
    expect(v.rayleigh).toBeLessThan(0.5);
  });
});

describe('daylightAdmittance', () => {
  it('is zero below civil twilight', () => {
    expect(daylightAdmittance(-7 * DEG)).toBe(0);
    expect(daylightAdmittance(-30 * DEG)).toBe(0);
  });
  it('is monotonic non-decreasing from -6° up to 30°', () => {
    const samples = [-6, -3, 0, 3, 6, 10, 15, 20, 30].map((d) => daylightAdmittance(d * DEG));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
  });
  it('plateaus near 1 by 30° and stays at the plateau higher', () => {
    expect(daylightAdmittance(30 * DEG)).toBeGreaterThanOrEqual(0.95);
    expect(daylightAdmittance(80 * DEG)).toBeGreaterThanOrEqual(daylightAdmittance(30 * DEG) - 1e-9);
    expect(daylightAdmittance(80 * DEG)).toBeLessThanOrEqual(1.0 + 1e-9);
  });
});

describe('lowered ambient baseline', () => {
  it('noon ambient ≤ 0.40 (was 0.78)', () => {
    expect(lightingFromAltitude(80 * DEG).ambient).toBeLessThanOrEqual(0.40);
  });
  it('noon envIntensity ≤ 0.55 (was 1.05)', () => {
    expect(lightingFromAltitude(80 * DEG).envIntensity).toBeLessThanOrEqual(0.55);
  });
  it('night ambient ≤ 0.08 (was 0.12)', () => {
    expect(lightingFromAltitude(-12 * DEG).ambient).toBeLessThanOrEqual(0.08);
  });
});
