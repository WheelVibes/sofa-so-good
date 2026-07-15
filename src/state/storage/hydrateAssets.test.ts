import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { __resetLodCacheForTest } from '../../furniture/gltf/lod'
import type { UserGltfDef } from '../../furniture/types'
import { useStore } from '../store'
import { hydrateUserAssets } from './hydrateAssets'
import { IdbAssetStore } from './IdbAssetStore'

/**
 * Boot-time restore of every user-uploaded model + material from IDB
 * (`hydrateUserAssets`). Runs before first catalog paint on every app boot —
 * a regression here silently loses or mis-restores the user's own uploads.
 * `resolveIkeaRuntimeUrls` (the other export of this module) is already
 * covered by `hydrateIkea.test.ts`; the material identity/uvScale round-trip
 * (BUG-003) is already covered by `hydrateMaterials.test.ts`; the LOD-sibling
 * re-registration path is exercised end-to-end via `persistUserGlb` in
 * `furniture/upload/persistLods.test.ts`. This file fills the remaining gaps:
 * the gltf/furniture field round-trip, the footprint-fallback + safeParse
 * resilience, pack/ikea-image/unknown-role record filtering, a material
 * missing its albedo channel, a corrupt/partial record not aborting the rest
 * of hydration, and the fail-soft paths (no IndexedDB, `list()` throwing,
 * empty store).
 *
 * Note on BUG-2 (`docs research`/`src/state/CLAUDE.md`): the "never silently
 * drop a placed item whose def can't resolve" guarantee is implemented one
 * layer up, in `hydrate.ts`/`schema.ts`'s `preserveUnresolvedItems` (already
 * tested in `hydrate.test.ts`). `hydrateUserAssets` only rebuilds the *defs*
 * from IDB; it has no item list to preserve, so that guard doesn't apply
 * here directly — but a corrupt/partial def record must still not throw and
 * must not prevent sibling defs from hydrating, which is what "doesn't nuke
 * the rest" below asserts.
 */

async function clearIdb(): Promise<void> {
  for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
}

function seedGltf(
  assetId: string,
  meta: Record<string, string | number | boolean | undefined>,
  name = 'Model',
): Promise<void> {
  return IdbAssetStore.put({
    assetId,
    kind: 'gltf',
    mime: 'model/gltf-binary',
    name,
    uploadedAt: '2026-06-19T00:00:00Z',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'model/gltf-binary' }),
    meta,
  })
}

function seedTexture(
  assetId: string,
  meta: Record<string, string | number | boolean | undefined>,
  name = 'tex.webp',
): Promise<void> {
  return IdbAssetStore.put({
    assetId,
    kind: 'texture',
    mime: 'image/webp',
    name,
    uploadedAt: '2026-06-19T00:00:00Z',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    meta,
  })
}

describe('hydrateUserAssets', () => {
  beforeEach(async () => {
    await clearIdb()
    useStore.getState().setUserFurniture([])
    useStore.getState().setUserMaterials([])
    __resetLodCacheForTest()
    // fake-indexeddb structured-clones Blobs to plain objects, which
    // happy-dom's real URL.createObjectURL would reject — stub it like the
    // sibling hydrate*.test.ts files. The URL string value isn't asserted.
    let seq = 0
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:test-${seq++}` })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does nothing when the IDB store is empty', async () => {
    await expect(hydrateUserAssets()).resolves.toBeUndefined()
    expect(useStore.getState().userFurniture).toEqual([])
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('fails soft (no throw, no change) when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(hydrateUserAssets()).resolves.toBeUndefined()
    expect(useStore.getState().userFurniture).toEqual([])
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('fails soft (no throw, no change) when IdbAssetStore.list() throws', async () => {
    vi.spyOn(IdbAssetStore, 'list').mockRejectedValueOnce(new Error('boom'))
    await expect(hydrateUserAssets()).resolves.toBeUndefined()
    expect(useStore.getState().userFurniture).toEqual([])
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('rebuilds a full UserGltfDef with every optional field round-tripped', async () => {
    await seedGltf(
      'asset-1',
      {
        category: 'seating',
        mounted: true,
        noClip: true,
        contentHash: 'sha-abc',
        byteSize: 12345,
        price: 199.5,
        slotSpec: '{"type":"bookshelf"}',
        assetSpec: '{"v":2,"spec":{"sourceScale":1,"parts":[],"meshOverrides":{}}}',
        footprint: JSON.stringify({ w: 1.2, d: 0.8, h: 0.9 }),
        finishTargets: JSON.stringify([{ key: 'body', label: 'Body' }]),
        finishOverrides: JSON.stringify({ body: '#334455' }),
      },
      'Armchair',
    )

    await hydrateUserAssets()

    const defs = useStore.getState().userFurniture
    expect(defs).toHaveLength(1)
    const def = defs[0] as UserGltfDef
    expect(def.id).toBe('user-asset-1')
    expect(def.name).toBe('Armchair')
    expect(def.category).toBe('seating')
    expect(def.kind).toBe('gltf')
    expect(def.source).toBe('user')
    expect(def.assetId).toBe('asset-1')
    expect(def.contentHash).toBe('sha-abc')
    expect(def.mounted).toBe(true)
    expect(def.noClip).toBe(true)
    expect(def.price).toBe(199.5)
    expect(def.byteSize).toBe(12345)
    expect(def.slotSpec).toBe('{"type":"bookshelf"}')
    expect(def.assetSpec).toBe('{"v":2,"spec":{"sourceScale":1,"parts":[],"meshOverrides":{}}}')
    expect(def.defaultFootprint).toEqual({ w: 1.2, d: 0.8, h: 0.9 })
    expect(def.finishTargets).toEqual([{ key: 'body', label: 'Body' }])
    expect(def.finishOverrides).toEqual({ body: '#334455' })
    expect(def.runtimeUrl).toBeTruthy()
  })

  it('defaults an unrecognized category to decor', async () => {
    await seedGltf('asset-cat', { category: 'not-a-real-category' })
    await hydrateUserAssets()
    expect(useStore.getState().userFurniture[0].category).toBe('decor')
  })

  it('defaults category to decor when omitted entirely', async () => {
    await seedGltf('asset-nocat', {})
    await hydrateUserAssets()
    expect(useStore.getState().userFurniture[0].category).toBe('decor')
  })

  describe('footprint fallback to 1x1x1', () => {
    it('when no footprint is stored', async () => {
      await seedGltf('asset-no-fp', { category: 'decor' })
      await hydrateUserAssets()
      const def = useStore.getState().userFurniture[0] as UserGltfDef
      expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    })

    it('when a stored dimension is zero', async () => {
      await seedGltf('asset-zero-fp', {
        category: 'decor',
        footprint: JSON.stringify({ w: 0, d: 1, h: 1 }),
      })
      await hydrateUserAssets()
      const def = useStore.getState().userFurniture[0] as UserGltfDef
      expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    })

    it('when a stored dimension is negative', async () => {
      await seedGltf('asset-neg-fp', {
        category: 'decor',
        footprint: JSON.stringify({ w: 1, d: -2, h: 1 }),
      })
      await hydrateUserAssets()
      const def = useStore.getState().userFurniture[0] as UserGltfDef
      expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    })

    it('when a stored dimension is non-finite', async () => {
      // JSON can't encode Infinity/NaN directly (JSON.stringify(Infinity) is
      // "null"), so write the malformed literal string as an upstream
      // hand-corrupted record would have to.
      await seedGltf('asset-inf-fp', {
        category: 'decor',
        footprint: '{"w":1,"d":1,"h":null}',
      })
      await hydrateUserAssets()
      const def = useStore.getState().userFurniture[0] as UserGltfDef
      expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    })

    it('when the stored footprint JSON is corrupt (safeParse resilience)', async () => {
      await seedGltf('asset-corrupt-fp', {
        category: 'decor',
        footprint: '{not valid json',
      })
      await expect(hydrateUserAssets()).resolves.not.toThrow()
      const def = useStore.getState().userFurniture[0] as UserGltfDef
      expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    })
  })

  it('skips pack-installed records so they never surface as user uploads', async () => {
    await seedGltf('asset-pack', { category: 'seating', source: 'pack' }, 'Pack Sofa')
    await hydrateUserAssets()
    expect(useStore.getState().userFurniture).toEqual([])
  })

  it('skips IKEA thumbnail image records from the material rebuild', async () => {
    await seedTexture('asset-ikea-thumb', { matId: 'ikea-malm', role: 'ikea-image' })
    await hydrateUserAssets()
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('skips a texture record with an unrecognized role', async () => {
    await seedTexture('asset-weird-role', { matId: 'mat-1', role: 'diffuse' })
    await hydrateUserAssets()
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('skips a texture record missing matId or role', async () => {
    await seedTexture('asset-no-matid', { role: 'albedo' })
    await seedTexture('asset-no-role', { matId: 'mat-2' })
    await hydrateUserAssets()
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('drops a material that has channels but no albedo (albedo is required)', async () => {
    await seedTexture('mat-3-normal', { matId: 'mat-3', role: 'normal' })
    await hydrateUserAssets()
    expect(useStore.getState().userMaterials).toEqual([])
  })

  it('builds a material once its albedo channel is present, merging sibling channels', async () => {
    await seedTexture('mat-4-albedo', { matId: 'mat-4', role: 'albedo', category: 'wall' })
    await seedTexture('mat-4-normal', { matId: 'mat-4', role: 'normal' })
    await seedTexture('mat-4-roughness', { matId: 'mat-4', role: 'roughness' })
    await hydrateUserAssets()
    const mats = useStore.getState().userMaterials
    expect(mats).toHaveLength(1)
    expect(mats[0].id).toBe('mat-4')
    expect(mats[0].textures.albedo).toBe('mat-4-albedo')
    expect(mats[0].textures.normal).toBe('mat-4-normal')
    expect(mats[0].textures.roughness).toBe('mat-4-roughness')
    expect(mats[0].textures.ao).toBeUndefined()
  })

  it('a record whose blob is unresolvable (corrupt/evicted) is skipped without aborting the rest', async () => {
    await seedGltf('asset-good-1', { category: 'seating' }, 'Good One')
    await seedGltf('asset-ghost', { category: 'seating' }, 'Ghost')
    await seedGltf('asset-good-2', { category: 'lighting' }, 'Good Two')

    const originalGet = IdbAssetStore.get.bind(IdbAssetStore)
    vi.spyOn(IdbAssetStore, 'get').mockImplementation(async (id: string) => {
      if (id === 'asset-ghost') return null
      return originalGet(id)
    })

    await expect(hydrateUserAssets()).resolves.not.toThrow()
    const names = useStore
      .getState()
      .userFurniture.map((d) => d.name)
      .sort()
    expect(names).toEqual(['Good One', 'Good Two'])
  })

  it('a material channel whose blob is unresolvable is skipped without aborting sibling materials', async () => {
    await seedTexture('mat-ok-albedo', { matId: 'mat-ok', role: 'albedo', name: 'OK' })
    await seedTexture('mat-ghost-albedo', { matId: 'mat-ghost', role: 'albedo' })

    const originalGet = IdbAssetStore.get.bind(IdbAssetStore)
    vi.spyOn(IdbAssetStore, 'get').mockImplementation(async (id: string) => {
      if (id === 'mat-ghost-albedo') return null
      return originalGet(id)
    })

    await expect(hydrateUserAssets()).resolves.not.toThrow()
    const mats = useStore.getState().userMaterials
    expect(mats.map((m) => m.id)).toEqual(['mat-ok'])
  })

  it('a corrupt footprint on one record does not prevent siblings (furniture + material) from hydrating', async () => {
    await seedGltf('asset-clean', { category: 'seating' }, 'Clean Sofa')
    await seedGltf('asset-dirty', { category: 'decor', footprint: 'not json at all' }, 'Dirty Lamp')
    await seedTexture('mat-clean-albedo', { matId: 'mat-clean', role: 'albedo', name: 'Clean Mat' })

    await expect(hydrateUserAssets()).resolves.not.toThrow()

    const furnitureNames = useStore
      .getState()
      .userFurniture.map((d) => d.name)
      .sort()
    expect(furnitureNames).toEqual(['Clean Sofa', 'Dirty Lamp'])
    const dirty = useStore
      .getState()
      .userFurniture.find((d) => d.name === 'Dirty Lamp') as UserGltfDef
    expect(dirty.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    expect(useStore.getState().userMaterials.map((m) => m.id)).toEqual(['mat-clean'])
  })

  it('hydrates multiple furniture and material defs together in one pass', async () => {
    await seedGltf('asset-a', { category: 'seating' }, 'Sofa A')
    await seedGltf('asset-b', { category: 'lighting' }, 'Lamp B')
    await seedTexture('mat-a-albedo', { matId: 'mat-a', role: 'albedo', name: 'Mat A' })
    await seedTexture('mat-b-albedo', { matId: 'mat-b', role: 'albedo', name: 'Mat B' })

    await hydrateUserAssets()

    expect(
      useStore
        .getState()
        .userFurniture.map((d) => d.name)
        .sort(),
    ).toEqual(['Lamp B', 'Sofa A'])
    expect(
      useStore
        .getState()
        .userMaterials.map((m) => m.id)
        .sort(),
    ).toEqual(['mat-a', 'mat-b'])
  })

  it('replaces (not appends to) userFurniture/userMaterials on each call', async () => {
    await seedGltf('asset-first', { category: 'seating' }, 'First')
    await hydrateUserAssets()
    expect(useStore.getState().userFurniture).toHaveLength(1)

    await clearIdb()
    await seedGltf('asset-second', { category: 'decor' }, 'Second')
    await hydrateUserAssets()

    const defs = useStore.getState().userFurniture
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('Second')
  })
})
