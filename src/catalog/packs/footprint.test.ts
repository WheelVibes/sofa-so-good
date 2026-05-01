import { describe, expect, it } from 'vitest';
import { glbFootprint } from './footprint';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('glbFootprint', () => {
  it('returns a positive bbox for a valid GLB', async () => {
    const buf = readFileSync(
      resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
    );
    const fp = await glbFootprint(new Uint8Array(buf));
    expect(fp.w).toBeGreaterThan(0);
    expect(fp.d).toBeGreaterThan(0);
    expect(fp.h).toBeGreaterThan(0);
  });

  it('falls back to a 1x1x1 footprint when the GLB is malformed', async () => {
    const fp = await glbFootprint(new Uint8Array([1, 2, 3, 4]));
    expect(fp).toEqual({ w: 1, d: 1, h: 1 });
  });
});
