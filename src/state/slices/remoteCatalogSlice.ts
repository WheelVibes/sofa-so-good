import type { StateCreator } from 'zustand'
import {
  getAsset,
  getIndex,
  getMeta,
  putAsset,
  putIndex,
  resetCacheForTest,
} from '../../catalog/remote/cache/db'
import { DEFAULT_ASSET_CAP_BYTES, evictUntilUnder } from '../../catalog/remote/cache/lru'
import { writeShadow } from '../../catalog/remote/cache/shadow'
import { activeProviderIds, PROVIDERS } from '../../catalog/remote/providers'
import { bundleToFurnitureDef, bundleToMaterialDef } from '../../catalog/remote/resolver'
import type { ProviderId, RemoteEntry, Resolution } from '../../catalog/remote/types'
import type { RemoteGltfDef } from '../../furniture/types'
import type { TexturedMaterialDef } from '../../materials/types'

const ONE_DAY = 24 * 60 * 60 * 1000
const STALE_AFTER = 7 * ONE_DAY

type RemoteIndexState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  entries: RemoteEntry[]
  fetchedAt?: string
  error?: string
}

export interface RemoteCatalogSlice {
  remoteIndexes: Record<ProviderId, RemoteIndexState>
  remoteFetches: Record<string, 'fetching' | 'error' | undefined>
  resolvedRemoteFurniture: Record<string, RemoteGltfDef>
  resolvedRemoteMaterials: Record<string, TexturedMaterialDef>
  remoteCacheBytes: number
  preferredResolution: Resolution
  setPreferredResolution(r: Resolution): void
  bootstrapRemoteCatalog(): Promise<void>
  refreshProviderIndex(p: ProviderId): Promise<void>
  resolveRemoteAsset(entry: RemoteEntry, r: Resolution): Promise<void>
  clearRemoteCache(): Promise<void>
}

const emptyIdx = (): RemoteIndexState => ({ status: 'idle', entries: [] })

export const REMOTE_CATALOG_INITIAL: Pick<
  RemoteCatalogSlice,
  | 'remoteIndexes'
  | 'remoteFetches'
  | 'resolvedRemoteFurniture'
  | 'resolvedRemoteMaterials'
  | 'remoteCacheBytes'
  | 'preferredResolution'
> = {
  remoteIndexes: { polyhaven: emptyIdx(), ambientcg: emptyIdx() },
  remoteFetches: {},
  resolvedRemoteFurniture: {},
  resolvedRemoteMaterials: {},
  remoteCacheBytes: 0,
  preferredResolution: '2k',
}

const inFlight = new Map<string, Promise<void>>()

export const createRemoteCatalogSlice: StateCreator<
  RemoteCatalogSlice,
  [],
  [],
  RemoteCatalogSlice
> = (set, get) => ({
  ...REMOTE_CATALOG_INITIAL,

  setPreferredResolution(r) {
    set({ preferredResolution: r })
  },

  async bootstrapRemoteCatalog() {
    const meta = await getMeta()
    set({ remoteCacheBytes: meta.totalBytes })
    // Which providers bootstrap at all is a flag/CORS question — see
    // `activeProviderIds`. Poly Haven is always in; ambientCG rides the
    // auth-gated R2 proxy and joins whenever `ambientcgLibrary` is on.
    await Promise.all(
      activeProviderIds().map(async (p) => {
        const cached = await getIndex(p)
        // A cached index survives a week, which is longer than a transport
        // change: entries the CURRENT provider can no longer fetch must be
        // refetched, not rendered (they resolve to nothing and the card sits on
        // its loading skeleton forever).
        if (cached && PROVIDERS[p].validateCached?.(cached.entries) !== false) {
          set((s) => ({
            remoteIndexes: {
              ...s.remoteIndexes,
              [p]: {
                status: 'ready',
                entries: cached.entries,
                fetchedAt: cached.fetchedAt,
              },
            },
          }))
          const age = Date.now() - new Date(cached.fetchedAt).getTime()
          if (age < STALE_AFTER) return
        }
        await get().refreshProviderIndex(p)
      }),
    )
  },

  async refreshProviderIndex(p) {
    set((s) => ({
      remoteIndexes: {
        ...s.remoteIndexes,
        [p]: { ...s.remoteIndexes[p], status: 'loading' },
      },
    }))
    try {
      const entries = await PROVIDERS[p].fetchIndex()
      await putIndex(p, entries)
      writeShadow(p, { count: entries.length, fetchedAt: new Date().toISOString() })
      set((s) => ({
        remoteIndexes: {
          ...s.remoteIndexes,
          [p]: {
            status: 'ready',
            entries,
            fetchedAt: new Date().toISOString(),
          },
        },
      }))
    } catch (e) {
      set((s) => ({
        remoteIndexes: {
          ...s.remoteIndexes,
          [p]: { ...s.remoteIndexes[p], status: 'error', error: String(e) },
        },
      }))
    }
  },

  async resolveRemoteAsset(entry, resolution) {
    const key = `${entry.provider}:${entry.slug}:${resolution}`
    if (get().resolvedRemoteFurniture[key] || get().resolvedRemoteMaterials[key]) {
      return
    }
    const existing = inFlight.get(key)
    if (existing) return existing

    const run = (async () => {
      set((s) => ({ remoteFetches: { ...s.remoteFetches, [key]: 'fetching' } }))
      try {
        let bundle = await getAsset(key)
        if (!bundle) {
          bundle = await PROVIDERS[entry.provider].fetchAsset(entry, resolution)
          await putAsset(key, bundle)
          await evictUntilUnder(DEFAULT_ASSET_CAP_BYTES)
          const meta = await getMeta()
          set({ remoteCacheBytes: meta.totalBytes })
        }
        if (bundle.kind === 'material') {
          const def = bundleToMaterialDef(entry, resolution, bundle)
          set((s) => ({
            resolvedRemoteMaterials: { ...s.resolvedRemoteMaterials, [key]: def },
            remoteFetches: { ...s.remoteFetches, [key]: undefined },
          }))
        } else {
          const def = bundleToFurnitureDef(entry, resolution, bundle)
          set((s) => ({
            resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, [key]: def },
            remoteFetches: { ...s.remoteFetches, [key]: undefined },
          }))
        }
      } catch (e) {
        set((s) => ({ remoteFetches: { ...s.remoteFetches, [key]: 'error' } }))
        throw e
      } finally {
        inFlight.delete(key)
      }
    })()
    inFlight.set(key, run)
    return run
  },

  async clearRemoteCache() {
    await resetCacheForTest()
    set({
      resolvedRemoteFurniture: {},
      resolvedRemoteMaterials: {},
      remoteCacheBytes: 0,
    })
  },
})
