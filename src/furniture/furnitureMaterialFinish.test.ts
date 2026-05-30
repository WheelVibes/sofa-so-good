import { describe, expect, it } from 'vitest';
import {
  FURNITURE_MAT_PREFIX,
  furnitureMaterialCacheId,
  parseFurnitureMaterialFinish,
  getSurfaceMaterial,
} from '../materials/furnitureMaterials';
import { buildMaterial } from '../materials/cache';
import type { SolidMaterialDef } from '../materials/types';

describe('furniture catalog/DLC material finishes', () => {
  it('encodes and parses `mat:<id>` finish ids', () => {
    expect(parseFurnitureMaterialFinish('wood')).toBeNull();
    expect(parseFurnitureMaterialFinish('painted')).toBeNull();
    expect(parseFurnitureMaterialFinish('mat:ambientcg:Wood048:1k')).toBe(
      'ambientcg:Wood048:1k',
    );
    expect(`${FURNITURE_MAT_PREFIX}x`).toBe('mat:x');
  });

  it('scopes the furniture cache id away from the floor/wall variant', () => {
    expect(furnitureMaterialCacheId('ambientcg:Wood048:1k')).toBe(
      'furn:ambientcg:Wood048:1k',
    );
    // The furniture id differs from the bare material id so a finish applied to
    // furniture never clobbers the same material used on a floor.
    expect(furnitureMaterialCacheId('oak')).not.toBe('oak');
  });

  it('getSurfaceMaterial returns the built material once it is in the cache', () => {
    const id = 'test:solid-oak';
    const def: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Test solid',
      category: 'floor',
      swatch: '#8a5a2b',
      kind: 'solid',
    };
    // Simulate the loader having built the material into the shared cache.
    const built = buildMaterial(def);
    // Asking for the `mat:<id>` finish returns exactly that cached instance
    // (the early return avoids the procedural fallback / canvas path).
    expect(getSurfaceMaterial(`mat:${id}`, '#ffffff')).toBe(built);
  });
});
