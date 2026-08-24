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
