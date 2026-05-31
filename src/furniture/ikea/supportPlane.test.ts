import { describe, it, expect } from 'vitest';
import { detectSupportPlaneY, type HorizontalBand } from './supportPlane';

const bedBands: HorizontalBand[] = [
  { y: 0.0, area: 0.02 },
  { y: 0.25, area: 1.6 },
  { y: 0.36, area: 0.3 },
  { y: 1.0, area: 0.25 },
];

describe('detectSupportPlaneY', () => {
  it('picks the dominant interior horizontal surface below the head/footboard region', () => {
    expect(detectSupportPlaneY(bedBands, 1.0)).toBeCloseTo(0.25, 2);
  });
  it('ignores the tall headboard top even though it is horizontal', () => {
    const y = detectSupportPlaneY(bedBands, 1.0);
    expect(y).not.toBeCloseTo(1.0, 1);
  });
  it('returns null when no band has meaningful area', () => {
    expect(detectSupportPlaneY([{ y: 0.1, area: 0.001 }], 1.0)).toBeNull();
  });
  it('prefers the highest qualifying surface when two large bands exist', () => {
    const bands: HorizontalBand[] = [
      { y: 0.1, area: 1.2 },
      { y: 0.25, area: 1.5 },
    ];
    expect(detectSupportPlaneY(bands, 1.0)).toBeCloseTo(0.25, 2);
  });
});
