import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  copyFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexAssets } from '../index-assets';
import { writeSidecar } from '../sidecar';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'index-test-'));
  mkdirSync(join(root, 'public/assets/furniture'), { recursive: true });
  mkdirSync(join(root, 'public/assets/materials'), { recursive: true });
  mkdirSync(join(root, 'src/furniture'), { recursive: true });
  mkdirSync(join(root, 'src/materials'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('indexAssets', () => {
  it('emits a TS module containing entries for each GLB', async () => {
    const glb = join(root, 'public/assets/furniture/demo-duck.glb');
    copyFileSync('public/assets/furniture/demo-duck.glb', glb);
    writeSidecar(glb, {
      id: 'demo-duck-fixture',
      name: 'Demo duck fixture',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 0.005,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: 'Khronos',
      sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Models',
    });
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(out).toContain('"demo-duck-fixture"');
    expect(out).toContain('"decor"');
    expect(out).toContain('"/assets/furniture/demo-duck.glb"');
    expect(out).toContain('"Khronos"');
  });

  it('throws on duplicate ids', async () => {
    const a = join(root, 'public/assets/furniture/a.glb');
    const b = join(root, 'public/assets/furniture/b.glb');
    copyFileSync('public/assets/furniture/demo-duck.glb', a);
    copyFileSync('public/assets/furniture/demo-duck.glb', b);
    const sidecar = {
      id: 'same-id',
      name: 'X',
      category: 'decor' as const,
      footprint: { w: 1, d: 1, h: 1 },
      scale: 1.0,
      anchor: 'floor-center' as const,
    };
    writeSidecar(a, sidecar);
    writeSidecar(b, sidecar);
    await expect(indexAssets({ projectRoot: root })).rejects.toThrow(/duplicate id/);
  });

  it('emits an empty catalog when no assets exist', async () => {
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    expect(out).toContain('export const GENERATED_FURNITURE');
    expect(out).toContain('[]');
  });

  it('emits sizeBytes matching the GLB file size', async () => {
    const glb = join(root, 'public/assets/furniture/demo-duck.glb');
    copyFileSync('public/assets/furniture/demo-duck.glb', glb);
    writeSidecar(glb, {
      id: 'demo-duck-bytes',
      name: 'Demo duck bytes',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 0.005,
      anchor: 'floor-center',
    });
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8');
    const match = out.match(/sizeBytes:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(statSync(glb).size);
  });

  it('emits material sizeBytes summed across channel files', async () => {
    const matDir = join(root, 'public/assets/materials/demo-mat');
    mkdirSync(matDir, { recursive: true });
    writeFileSync(join(matDir, 'albedo.jpg'), Buffer.alloc(1000));
    writeFileSync(join(matDir, 'normal.jpg'), Buffer.alloc(500));
    writeSidecar(join(matDir, 'material'), {
      id: 'demo-mat',
      name: 'Demo mat',
      category: 'floor',
      uvScale: [1, 1],
      channels: { albedo: 'albedo.jpg', normal: 'normal.jpg' },
      license: 'CC0',
      sourceUrl: 'https://polyhaven.com/a/demo',
    });
    await indexAssets({ projectRoot: root });
    const out = readFileSync(join(root, 'src/materials/generatedCatalog.ts'), 'utf8');
    const match = out.match(/sizeBytes:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(1500);
  });
});
