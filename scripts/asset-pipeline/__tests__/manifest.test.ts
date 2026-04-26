import { describe, it, expect } from 'vitest';
import {
  furnitureManifestSchema,
  materialManifestSchema,
} from '../manifest';

describe('furnitureManifestSchema', () => {
  const ok = {
    id: 'kenney-armchair',
    source: 'kenney',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl: 'https://kenney.nl/foo.glb',
    license: 'CC0',
    attribution: 'Kenney',
    name: 'Armchair',
    category: 'seating',
    footprint: { w: 0.8, d: 0.85, h: 0.95 },
  };

  it('accepts a minimal valid entry', () => {
    expect(() => furnitureManifestSchema.parse(ok)).not.toThrow();
  });

  it('rejects an invalid category', () => {
    expect(() =>
      furnitureManifestSchema.parse({ ...ok, category: 'bogus' }),
    ).toThrow();
  });

  it('rejects a non-CC0 license', () => {
    expect(() =>
      furnitureManifestSchema.parse({ ...ok, license: 'CC-BY' }),
    ).toThrow();
  });

  it('rejects negative footprint dims', () => {
    expect(() =>
      furnitureManifestSchema.parse({
        ...ok,
        footprint: { w: -1, d: 0.5, h: 0.5 },
      }),
    ).toThrow();
  });

  it('defaults scale to 1.0 and anchor to floor-center when omitted', () => {
    const parsed = furnitureManifestSchema.parse(ok);
    expect(parsed.scale).toBe(1.0);
    expect(parsed.anchor).toBe('floor-center');
  });
});

describe('materialManifestSchema', () => {
  const ok = {
    id: 'floor-wood-oak',
    source: 'polyhaven',
    sourceUrl: 'https://polyhaven.com/a/wood_floor_deck',
    downloads: {
      albedo: 'https://polyhaven.com/diff.jpg',
      normal: 'https://polyhaven.com/nor.jpg',
      rough: 'https://polyhaven.com/rough.jpg',
    },
    license: 'CC0',
    attribution: 'Poly Haven',
    name: 'Oak planks',
    category: 'floor',
    uvScale: [1.5, 1.5],
  };

  it('accepts a minimal valid entry', () => {
    expect(() => materialManifestSchema.parse(ok)).not.toThrow();
  });

  it('requires albedo download', () => {
    const { downloads, ...rest } = ok;
    expect(() =>
      materialManifestSchema.parse({
        ...rest,
        downloads: { normal: downloads.normal },
      }),
    ).toThrow();
  });
});
