import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetBundle, RemoteEntry } from '../../catalog/remote/types'
import { useStore } from '../store'

const getAsset = vi.fn()
const getIndex = vi.fn()
const getMeta = vi.fn()
const putAsset = vi.fn()
const putIndex = vi.fn()
const resetCacheForTest = vi.fn()
vi.mock('../../catalog/remote/cache/db', () => ({
  getAsset: (...a: unknown[]) => getAsset(...a),
  getIndex: (...a: unknown[]) => getIndex(...a),
  getMeta: (...a: unknown[]) => getMeta(...a),
  putAsset: (...a: unknown[]) => putAsset(...a),
  putIndex: (...a: unknown[]) => putIndex(...a),
  resetCacheForTest: (...a: unknown[]) => resetCacheForTest(...a),
}))

const evictUntilUnder = vi.fn()
vi.mock('../../catalog/remote/cache/lru', () => ({
  DEFAULT_ASSET_CAP_BYTES: 500 * 1024 * 1024,
  evictUntilUnder: (...a: unknown[]) => evictUntilUnder(...a),
}))

const writeShadow = vi.fn()
vi.mock('../../catalog/remote/cache/shadow', () => ({
  writeShadow: (...a: unknown[]) => writeShadow(...a),
}))

const fetchIndexPolyhaven = vi.fn()
const fetchAssetPolyhaven = vi.fn()
const fetchIndexAmbientcg = vi.fn()
const fetchAssetAmbientcg = vi.fn()
const validateCachedAmbientcg = vi.fn((_entries?: unknown) => true)
const tileSizeForAmbientcg = vi.fn(async (_slug?: string) => null as [number, number] | null)
const activeProviderIdsMock = vi.fn(() => ['polyhaven'])
vi.mock('../../catalog/remote/providers', () => ({
  PROVIDERS: {
    polyhaven: {
      id: 'polyhaven',
      fetchIndex: (...a: unknown[]) => fetchIndexPolyhaven(...a),
      fetchAsset: (...a: unknown[]) => fetchAssetPolyhaven(...a),
    },
    ambientcg: {
      id: 'ambientcg',
      fetchIndex: (...a: unknown[]) => fetchIndexAmbientcg(...a),
      fetchAsset: (...a: unknown[]) => fetchAssetAmbientcg(...a),
      validateCached: (entries: unknown) => validateCachedAmbientcg(entries),
      tileSizeFor: (slug: string) => tileSizeForAmbientcg(slug),
    },
  },
  activeProviderIds: () => activeProviderIdsMock(),
}))

const bundleToFurnitureDef = vi.fn()
const bundleToMaterialDef = vi.fn()
vi.mock('../../catalog/remote/resolver', () => ({
  bundleToFurnitureDef: (...a: unknown[]) => bundleToFurnitureDef(...a),
  bundleToMaterialDef: (...a: unknown[]) => bundleToMaterialDef(...a),
}))

const ONE_DAY = 24 * 60 * 60 * 1000
const STALE_AFTER = 7 * ONE_DAY

const furnitureEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'chair-01',
  kind: 'furniture',
  name: 'Chair',
  category: 'seating',
  thumbUrl: 'https://example.com/thumb.jpg',
  resolutions: ['1k', '2k'],
  attribution: 'CC0',
  sourceUrl: 'https://example.com/chair-01',
}

const furnitureBundle: AssetBundle = {
  kind: 'furniture',
  gltfJson: {},
  textures: {},
  rootPath: '',
}

describe('remoteCatalogSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    getAsset.mockReset().mockResolvedValue(undefined)
    getIndex.mockReset().mockResolvedValue(undefined)
    getMeta.mockReset().mockResolvedValue({ schemaVersion: 1, totalBytes: 0, entries: [] })
    putAsset.mockReset().mockResolvedValue(undefined)
    putIndex.mockReset().mockResolvedValue(undefined)
    resetCacheForTest.mockReset().mockResolvedValue(undefined)
    evictUntilUnder.mockReset().mockResolvedValue(undefined)
    writeShadow.mockReset()
    fetchIndexPolyhaven.mockReset().mockResolvedValue([])
    fetchAssetPolyhaven.mockReset().mockResolvedValue(furnitureBundle)
    fetchIndexAmbientcg.mockReset().mockResolvedValue([])
    fetchAssetAmbientcg.mockReset().mockResolvedValue(furnitureBundle)
    activeProviderIdsMock.mockReset().mockReturnValue(['polyhaven'])
    validateCachedAmbientcg.mockReset().mockReturnValue(true)
    tileSizeForAmbientcg.mockReset().mockResolvedValue(null)
    bundleToFurnitureDef.mockReset().mockReturnValue({ id: 'fake-furniture-def' })
    bundleToMaterialDef.mockReset().mockReturnValue({ id: 'fake-material-def' })
  })

  describe('resolveRemoteAsset — in-flight de-dupe', () => {
    it('shares one underlying fetchAsset across two concurrent calls for the same key', async () => {
      const [p1, p2] = [
        useStore.getState().resolveRemoteAsset(furnitureEntry, '2k'),
        useStore.getState().resolveRemoteAsset(furnitureEntry, '2k'),
      ]
      await Promise.all([p1, p2])
      expect(fetchAssetPolyhaven).toHaveBeenCalledTimes(1)
      expect(useStore.getState().resolvedRemoteFurniture['polyhaven:chair-01:2k']).toEqual({
        id: 'fake-furniture-def',
      })
    })

    it('issues a fresh fetch for a later, non-overlapping call to the same key', async () => {
      await useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')
      expect(fetchAssetPolyhaven).toHaveBeenCalledTimes(1)
      // Resolved already — the "already resolved" short-circuit prevents a
      // second fetch rather than the in-flight map (which was cleared).
      await useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')
      expect(fetchAssetPolyhaven).toHaveBeenCalledTimes(1)
    })
  })

  describe('bootstrapRemoteCatalog — STALE_AFTER decision', () => {
    it('skips refreshProviderIndex when the cached index is newer than STALE_AFTER', async () => {
      getIndex.mockResolvedValue({
        entries: [],
        fetchedAt: new Date(Date.now() - ONE_DAY).toISOString(),
      })
      await useStore.getState().bootstrapRemoteCatalog()
      expect(fetchIndexPolyhaven).not.toHaveBeenCalled()
      expect(useStore.getState().remoteIndexes.polyhaven.status).toBe('ready')
    })

    it('refreshes when the cached index is older than STALE_AFTER', async () => {
      getIndex.mockResolvedValue({
        entries: [],
        fetchedAt: new Date(Date.now() - STALE_AFTER - ONE_DAY).toISOString(),
      })
      await useStore.getState().bootstrapRemoteCatalog()
      expect(fetchIndexPolyhaven).toHaveBeenCalledTimes(1)
    })

    it('refreshes when there is no cached index', async () => {
      getIndex.mockResolvedValue(undefined)
      await useStore.getState().bootstrapRemoteCatalog()
      expect(fetchIndexPolyhaven).toHaveBeenCalledTimes(1)
    })
  })

  describe('bootstrapRemoteCatalog — cached index the provider disowns', () => {
    const staleEntry = { ...furnitureEntry, provider: 'ambientcg' as const }

    beforeEach(() => {
      activeProviderIdsMock.mockReturnValue(['ambientcg'])
      getIndex.mockResolvedValue({
        entries: [staleEntry],
        fetchedAt: new Date(Date.now() - ONE_DAY).toISOString(),
      })
    })

    it('refetches a fresh-but-invalid index instead of rendering it', async () => {
      // A week-long cache outlives a transport change; entries the current
      // provider can no longer fetch load forever if they reach the grid.
      validateCachedAmbientcg.mockReturnValue(false)
      await useStore.getState().bootstrapRemoteCatalog()
      expect(fetchIndexAmbientcg).toHaveBeenCalledTimes(1)
      expect(useStore.getState().remoteIndexes.ambientcg.entries).not.toContain(staleEntry)
    })

    it('still serves a fresh index the provider vouches for', async () => {
      await useStore.getState().bootstrapRemoteCatalog()
      expect(fetchIndexAmbientcg).not.toHaveBeenCalled()
      expect(useStore.getState().remoteIndexes.ambientcg.entries).toEqual([staleEntry])
    })
  })

  describe('resolveRemoteAsset — already-resolved short circuit', () => {
    it('does not re-fetch a key already in resolvedRemoteFurniture', async () => {
      useStore.setState({
        resolvedRemoteFurniture: { 'polyhaven:chair-01:2k': { id: 'already' } },
      } as never)
      await useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')
      expect(getAsset).not.toHaveBeenCalled()
      expect(fetchAssetPolyhaven).not.toHaveBeenCalled()
    })

    it('does not re-fetch a key already in resolvedRemoteMaterials', async () => {
      useStore.setState({
        resolvedRemoteMaterials: { 'polyhaven:chair-01:2k': { id: 'already' } },
      } as never)
      await useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')
      expect(getAsset).not.toHaveBeenCalled()
      expect(fetchAssetPolyhaven).not.toHaveBeenCalled()
    })
  })

  describe('error status transitions', () => {
    it('lands status:"error" when fetchIndex throws, without an unhandled rejection', async () => {
      fetchIndexPolyhaven.mockRejectedValue(new Error('index boom'))
      await expect(useStore.getState().refreshProviderIndex('polyhaven')).resolves.toBeUndefined()
      const idx = useStore.getState().remoteIndexes.polyhaven
      expect(idx.status).toBe('error')
      expect(idx.error).toContain('index boom')
    })

    it('lands a remoteFetches error entry when fetchAsset throws, without an unhandled rejection', async () => {
      fetchAssetPolyhaven.mockRejectedValue(new Error('asset boom'))
      await expect(useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')).rejects.toThrow(
        'asset boom',
      )
      expect(useStore.getState().remoteFetches['polyhaven:chair-01:2k']).toBe('error')
      expect(useStore.getState().resolvedRemoteFurniture['polyhaven:chair-01:2k']).toBeUndefined()
    })

    it('recovers from a prior fetchAsset error on a subsequent call for the same key', async () => {
      fetchAssetPolyhaven.mockRejectedValueOnce(new Error('asset boom'))
      await expect(useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')).rejects.toThrow(
        'asset boom',
      )

      fetchAssetPolyhaven.mockResolvedValueOnce(furnitureBundle)
      await useStore.getState().resolveRemoteAsset(furnitureEntry, '2k')
      expect(useStore.getState().resolvedRemoteFurniture['polyhaven:chair-01:2k']).toEqual({
        id: 'fake-furniture-def',
      })
      expect(useStore.getState().remoteFetches['polyhaven:chair-01:2k']).toBeUndefined()
    })
  })
})

describe('resolveRemoteAsset — physical tile size for a synthetic entry', () => {
  const materialEntry: RemoteEntry = {
    provider: 'ambientcg',
    slug: 'Tiles087',
    kind: 'material',
    name: 'Tiles087',
    category: 'floor',
    thumbUrl: '',
    resolutions: ['1k'],
    attribution: 'ambientCG (CC0)',
    sourceUrl: 'x',
  }
  const materialBundle: AssetBundle = { kind: 'material', channels: { albedo: new Blob(['a']) } }

  // This block sits outside the main describe, so it owns its own reset — and
  // each case uses its own slug, since a resolved key short-circuits the next
  // resolve (that is the in-flight/already-resolved guard, not a bug here).
  beforeEach(() => {
    useStore.getState().__resetForTest()
    getAsset.mockReset().mockResolvedValue(undefined)
    getMeta.mockReset().mockResolvedValue({ schemaVersion: 1, totalBytes: 0, entries: [] })
    putAsset.mockReset().mockResolvedValue(undefined)
    evictUntilUnder.mockReset().mockResolvedValue(undefined)
    fetchAssetAmbientcg.mockReset().mockResolvedValue(materialBundle)
    tileSizeForAmbientcg.mockReset().mockResolvedValue(null)
    bundleToMaterialDef.mockReset().mockImplementation((entry: unknown) => ({
      id: 'def',
      uvScale: (entry as RemoteEntry).uvScale ?? [1, 1],
    }))
  })

  it('asks the provider when the entry carries no size', async () => {
    // A finish id rehydrated from a save (`ambientcg:Tiles087:2k`) has no
    // physical size, and its maps often come from the IDB cache — so nothing
    // has loaded the manifest. Without this the floor rendered at a flat 1 m.
    tileSizeForAmbientcg.mockResolvedValue([2.45, 2.45])
    await useStore.getState().resolveRemoteAsset({ ...materialEntry, slug: 'AskMe' }, '1k')
    expect(tileSizeForAmbientcg).toHaveBeenCalledWith('AskMe')
    expect(bundleToMaterialDef.mock.calls[0][0]).toMatchObject({ uvScale: [2.45, 2.45] })
  })

  it('does not ask when the entry already knows its size', async () => {
    await useStore
      .getState()
      .resolveRemoteAsset({ ...materialEntry, slug: 'KnowsOwn', uvScale: [0.6, 0.6] }, '1k')
    expect(tileSizeForAmbientcg).not.toHaveBeenCalled()
    expect(bundleToMaterialDef.mock.calls[0][0]).toMatchObject({ uvScale: [0.6, 0.6] })
  })

  it('resolves anyway when the provider cannot say (offline / signed out)', async () => {
    tileSizeForAmbientcg.mockResolvedValue(null)
    await useStore.getState().resolveRemoteAsset({ ...materialEntry, slug: 'Unknown' }, '1k')
    expect(bundleToMaterialDef.mock.calls[0][0].uvScale).toBeUndefined()
    expect(useStore.getState().resolvedRemoteMaterials['ambientcg:Unknown:1k']).toBeTruthy()
  })
})
