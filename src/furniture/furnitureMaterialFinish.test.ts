import { MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildMaterial, getBuiltMaterial, getCachedMaterial } from '../materials/cache'
import {
  FURNITURE_MAT_PREFIX,
  furnitureMaterialCacheId,
  getSurfaceMaterial,
  parseFurnitureMaterialFinish,
} from '../materials/furnitureMaterials'
import type { ProceduralMaterialDef, SolidMaterialDef } from '../materials/types'
import { BUILTIN_CATALOG } from './builtinCatalog'
import type { ParametricDef } from './types'
import { defaultParamProps } from './types'

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

  // ── Default-finish resolution (C264) ────────────────────────────────────

  it('user override wins over the catalog default', () => {
    // dining-table-4 defaults frameFinish/finish to mat:floor-wood-oak.
    // A user who explicitly chose 'painted' must keep painted — defaultParamProps
    // only reflects the schema default, and the store carries the merged props.
    const diningDef = BUILTIN_CATALOG['dining-table-4'] as ParametricDef
    const defaults = defaultParamProps(diningDef)
    // Default should now be the CC0 oak mat:
    expect(defaults.finish).toBe('mat:floor-wood-oak')

    // A user override stays untouched — the store merges on top of defaults.
    const userProps = { ...defaults, finish: 'painted' }
    expect(userProps.finish).toBe('painted')
  })

  it('key furniture categories default to mat:floor-wood-oak', () => {
    const keyItems = [
      'bed-single',
      'bed-double',
      'bed-queen',
      'bed-king',
      'dining-table-4',
      'desk',
      'bookshelf',
      'sideboard',
      'wardrobe-3door',
      'dresser',
      'nightstand',
    ] as const
    for (const id of keyItems) {
      const def = BUILTIN_CATALOG[id] as ParametricDef
      const defaults = defaultParamProps(def)
      // Either frameFinish or finish should be the CC0 oak default.
      const finish = defaults.frameFinish ?? defaults.finish
      expect(finish, `${id} should default to mat:floor-wood-oak`).toBe('mat:floor-wood-oak')
    }
  })

  it('falls back to a valid material when the mat: id is not in the cache', () => {
    // A mat: finish that FurnitureMaterialLoader hasn't built yet must resolve
    // to a valid MeshStandardMaterial via the procedural fallback path (not crash).
    // parseFurnitureMaterialFinish correctly identifies it as a mat: finish.
    const id = 'test:unbuilt-fallback'
    expect(parseFurnitureMaterialFinish(`mat:${id}`)).toBe(id)
    // When the mat: id IS in the cache, getSurfaceMaterial returns it exactly.
    const fallbackDef: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Fallback test',
      category: 'floor',
      swatch: '#8a5a2b',
      kind: 'solid',
    }
    const built = buildMaterial(fallbackDef)
    const result = getSurfaceMaterial(`mat:${id}`, '#9e7b53')
    expect(result).toBe(built)
  })

  it('getSurfaceMaterial repeat=1 returns the base material directly', () => {
    const id = 'test:repeat-identity'
    const def: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Repeat identity test',
      category: 'floor',
      swatch: '#9e7b53',
      kind: 'solid',
    }
    const base = buildMaterial(def)
    // repeat=1 (the default) should return the base without cloning.
    expect(getSurfaceMaterial(`mat:${id}`, '#9e7b53', 1)).toBe(base)
    expect(getSurfaceMaterial(`mat:${id}`, '#9e7b53')).toBe(base)
  })

  it('getSurfaceMaterial repeat≠1 returns a distinct cached clone', () => {
    const id = 'test:repeat-clone'
    const def: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'Repeat clone test',
      category: 'floor',
      swatch: '#9e7b53',
      kind: 'solid',
    }
    const base = buildMaterial(def)
    // repeat=1.5 → a new clone, not the base.
    const clone1 = getSurfaceMaterial(`mat:${id}`, '#9e7b53', 1.5)
    expect(clone1).not.toBe(base)
    expect(clone1).toBeInstanceOf(MeshStandardMaterial)
    // Same repeat → same cached clone (no new object on each call).
    const clone2 = getSurfaceMaterial(`mat:${id}`, '#9e7b53', 1.5)
    expect(clone2).toBe(clone1)
    // Different repeat → different clone.
    const clone3 = getSurfaceMaterial(`mat:${id}`, '#9e7b53', 2.0)
    expect(clone3).not.toBe(clone1)
  })

  it('UV-scale: repeat clone sets map.repeat to the requested value', () => {
    // Build a solid def, then attach a texture to test the map-clone path.
    const id = 'test:uv-scale-map'
    const solidDef: SolidMaterialDef = {
      id: furnitureMaterialCacheId(id),
      name: 'UV map test',
      category: 'floor',
      swatch: '#9e7b53',
      kind: 'solid',
    }
    const built = buildMaterial(solidDef)
    // Attach a map manually to simulate what FurnitureMaterialLoader builds.
    built.map = new Texture()
    built.map.repeat.set(2, 2)
    built.map.needsUpdate = true

    // Request repeat=1.5 — should clone the base and set map.repeat(1.5, 1.5).
    const result = getSurfaceMaterial(`mat:${id}`, '#9e7b53', 1.5)
    expect(result).toBeInstanceOf(MeshStandardMaterial)
    expect(result).not.toBe(built)
    expect(result.map).not.toBeNull()
    expect(result.map?.repeat.x).toBeCloseTo(1.5)
    expect(result.map?.repeat.y).toBeCloseTo(1.5)
    // The original base material's map repeat is unchanged.
    expect(built.map?.repeat.x).toBeCloseTo(2)
  })
})
