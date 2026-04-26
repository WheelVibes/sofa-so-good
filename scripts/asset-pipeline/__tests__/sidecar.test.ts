import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar, resolveFurnitureMetadata } from '../sidecar';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sidecar-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('writeSidecar / readSidecar', () => {
  it('round-trips JSON', () => {
    const path = join(tmp, 'foo.glb');
    writeFileSync(path, 'glb-bytes');
    writeSidecar(path, { id: 'foo', category: 'decor' });
    expect(readSidecar(path)).toEqual({ id: 'foo', category: 'decor' });
  });

  it('returns null when no sidecar exists', () => {
    expect(readSidecar(join(tmp, 'nope.glb'))).toBeNull();
  });
});

describe('resolveFurnitureMetadata', () => {
  it('uses sidecar values when present', async () => {
    const meta = await resolveFurnitureMetadata({
      glbPath: 'unused-when-sidecar-present',
      sidecar: {
        id: 'side-id',
        name: 'Side Name',
        category: 'seating',
        footprint: { w: 1, d: 1, h: 1 },
        scale: 1.0,
        anchor: 'floor-center',
        license: 'CC0',
        attribution: 'Test',
        sourceUrl: 'https://example.com',
      },
      bboxFn: async () => ({ w: 99, d: 99, h: 99 }),
    });
    expect(meta.id).toBe('side-id');
    expect(meta.footprint.w).toBe(1);
  });

  it('derives id and footprint from filename + bbox when sidecar is missing', async () => {
    const meta = await resolveFurnitureMetadata({
      glbPath: '/tmp/dropped/cool-couch.glb',
      sidecar: null,
      bboxFn: async () => ({ w: 2.1, d: 0.9, h: 0.85 }),
    });
    expect(meta.id).toBe('dropped-cool-couch');
    expect(meta.name).toBe('Cool Couch');
    expect(meta.category).toBe('decor');
    expect(meta.footprint).toEqual({ w: 2.1, d: 0.9, h: 0.85 });
    expect(meta.scale).toBe(1.0);
    expect(meta.attribution).toBeUndefined();
  });
});
