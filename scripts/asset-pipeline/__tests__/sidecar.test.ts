import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectMaterialFromFolder,
  readSidecar,
  resolveFurnitureMetadata,
  writeSidecar,
} from '../sidecar';

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

describe('detectMaterialFromFolder', () => {
  it('maps Poly Haven naming (_diff/_nor_gl/_rough/_ao) to channels', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/oak_floor',
      slugHint: 'oak-floor',
      files: [
        'oak_floor_2k_diff.jpg',
        'oak_floor_2k_nor_gl.jpg',
        'oak_floor_2k_rough.jpg',
        'oak_floor_2k_ao.jpg',
      ],
    });
    expect(meta).not.toBeNull();
    expect(meta!.id).toBe('dropped-oak-floor');
    expect(meta!.category).toBe('floor');
    expect(meta!.channels).toEqual({
      albedo: 'oak_floor_2k_diff.jpg',
      normal: 'oak_floor_2k_nor_gl.jpg',
      rough: 'oak_floor_2k_rough.jpg',
      ao: 'oak_floor_2k_ao.jpg',
    });
  });

  it('maps ambientCG naming (_Color/_NormalGL/_Roughness/_AmbientOcclusion)', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/Bricks082',
      slugHint: 'bricks082',
      files: [
        'Bricks082_2K_Color.jpg',
        'Bricks082_2K_NormalGL.jpg',
        'Bricks082_2K_Roughness.jpg',
        'Bricks082_2K_AmbientOcclusion.jpg',
      ],
    });
    expect(meta).not.toBeNull();
    expect(meta!.category).toBe('wall');
    expect(meta!.channels.albedo).toBe('Bricks082_2K_Color.jpg');
    expect(meta!.channels.normal).toBe('Bricks082_2K_NormalGL.jpg');
    expect(meta!.channels.rough).toBe('Bricks082_2K_Roughness.jpg');
    expect(meta!.channels.ao).toBe('Bricks082_2K_AmbientOcclusion.jpg');
  });

  it('classifies wall-flavored slugs (brick, plaster, paint, tile) as wall', () => {
    const wall = detectMaterialFromFolder({
      dir: '/tmp/painted_plaster',
      slugHint: 'painted-plaster',
      files: ['painted_plaster_diff.jpg'],
    });
    expect(wall!.category).toBe('wall');
  });

  it('treats a single texture as albedo when no suffix matches', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/loose',
      slugHint: 'loose',
      files: ['loose.png'],
    });
    expect(meta!.channels.albedo).toBe('loose.png');
    expect(meta!.channels.normal).toBeUndefined();
  });

  it('returns null when no albedo-like file exists', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/nope',
      slugHint: 'nope',
      files: ['something_nor.jpg', 'something_rough.jpg'],
    });
    expect(meta).toBeNull();
  });

  it('returns null for an empty folder', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/empty',
      slugHint: 'empty',
      files: [],
    });
    expect(meta).toBeNull();
  });

  it('first-match-wins when both _diff and _color are present', () => {
    const meta = detectMaterialFromFolder({
      dir: '/tmp/dup',
      slugHint: 'dup',
      files: ['x_diff.jpg', 'x_color.jpg'],
    });
    expect(meta!.channels.albedo).toMatch(/x_(diff|color)\.jpg/);
  });
});
