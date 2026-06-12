import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildMaterial, getBuiltMaterial, getCachedMaterial } from '../materials/cache'
import {
  FURNITURE_MAT_PREFIX,
  furnitureMaterialCacheId,
  getSurfaceMaterial,
  parseFurnitureMaterialFinish,
} from '../materials/furnitureMaterials'
import type { ProceduralMaterialDef, SolidMaterialDef } from '../materials/types'

// Procedural generation paints a 2D canvas (not implemented in happy-dom) —
// stub the generator; the cache-key behaviour under test is in cache.ts.
vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateProcedural: () => ({
    albedo: new Texture(),
    normal: new Texture(),
    roughness: new Texture(),
    metalness: 0,
  }),
}))

describe('furniture catalog/DLC material finishes', () => {
  it('encodes and parses `mat:<id>` finish ids', () => {
    expect(parseFurnitureMaterialFinish('wood')).toBeNull()
    expect(parseFurnitureMaterialFinish('painted')).toBeNull()
    expect(parseFurnitureMaterialFinish('mat:ambientcg:Wood048:1k')).toBe('ambientcg:Wood048:1k')
    expect(`${FURNITURE_MAT_PREFIX}x`).toBe('mat:x')
  })

  it('scopes the furniture cache id away from the floor/wall variant', () => {
    expect(furnitureMaterialCacheId('ambientcg:Wood048:1k')).toBe('furn:ambientcg:Wood048:1k')
    // The furniture id differs from the bare material id so a finish applied to
    // furniture never clobbers the same material used on a floor.
    expect(furnitureMaterialCacheId('oak')).not.toBe('oak')
  })

  it('getSurfaceMaterial returns the built material once it is in the cache', () => {
    const id = 'test:solid-oak'
    const def: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Test solid',
      category: 'floor',
      swatch: '#8a5a2b',
      kind: 'solid',
    }
    // Simulate the loader having built the material into the shared cache.
    const built = buildMaterial(def)
    // Asking for the `mat:<id>` finish returns exactly that cached instance
    // (the early return avoids the procedural fallback / canvas path).
    expect(getSurfaceMaterial(`mat:${id}`, '#ffffff')).toBe(built)
  })

  it('finds a built PROCEDURAL material despite its size-suffixed cache key', () => {
    // buildMaterial caches procedural materials under `id@<size>` (so a
    // quality change regenerates them) — the plain-id lookup misses, which
    // used to silently drop every procedural `mat:<id>` furniture finish
    // (Teak/Ash/Ebony quick finishes) onto the generic wood fallback.
    const id = 'test:proc-teak'
    const def: ProceduralMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Test procedural',
      category: 'floor',
      swatch: '#8a5a2b',
      kind: 'procedural',
      pattern: 'wood',
      uvScale: [0.5, 0.5],
    }
    const built = buildMaterial(def)
    expect(getCachedMaterial(def.id)).toBeUndefined() // the historical miss
    expect(getBuiltMaterial(def.id)).toBe(built)
    expect(getSurfaceMaterial(`mat:${id}`, '#ffffff')).toBe(built)
  })
})
