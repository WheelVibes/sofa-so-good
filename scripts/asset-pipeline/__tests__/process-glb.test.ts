import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processGlb, deriveBoundingBox } from '../process-glb';

let tmp: string;
const FIXTURE_GLB = 'scripts/asset-pipeline/__tests__/fixtures/duck.glb';

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'glb-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('processGlb', () => {
  it('writes an output GLB in compress mode', async () => {
    const out = join(tmp, 'out.glb');
    await processGlb(FIXTURE_GLB, out, { compress: true });
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(0);
  });

  it('quick mode just copies the file', async () => {
    const out = join(tmp, 'out.glb');
    await processGlb(FIXTURE_GLB, out, { compress: false });
    expect(statSync(out).size).toBe(statSync(FIXTURE_GLB).size);
  });
});

describe('deriveBoundingBox', () => {
  it('returns a positive bbox for the duck fixture', async () => {
    const bbox = await deriveBoundingBox(FIXTURE_GLB);
    expect(bbox.w).toBeGreaterThan(0);
    expect(bbox.d).toBeGreaterThan(0);
    expect(bbox.h).toBeGreaterThan(0);
  });
});
