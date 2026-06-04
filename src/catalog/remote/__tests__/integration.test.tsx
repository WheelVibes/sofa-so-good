import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../../state/store'
import { resetCacheForTest } from '../cache/db'
import type { RemoteEntry } from '../types'

const sample: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'wood',
  kind: 'material',
  name: 'Wood',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://x',
}

vi.mock('../providers', () => ({
  activeProviderIds: () => ['polyhaven', 'ambientcg'],
  PROD_PROVIDER_IDS: ['polyhaven'],
  PROVIDERS: {
    polyhaven: {
      id: 'polyhaven',
      fetchIndex: vi.fn(async () => [sample]),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
    ambientcg: {
      id: 'ambientcg',
      fetchIndex: vi.fn(async () => []),
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({
        kind: 'material',
        channels: { albedo: new Blob(['a']) },
      })),
    },
  },
}))

describe('remote catalog integration', () => {
  beforeEach(async () => {
    await resetCacheForTest()
    useStore.setState({
      remoteIndexes: {
        polyhaven: { status: 'idle', entries: [] },
        ambientcg: { status: 'idle', entries: [] },
      },
      remoteFetches: {},
      resolvedRemoteFurniture: {},
      resolvedRemoteMaterials: {},
      remoteCacheBytes: 0,
    })
  })

  it('bootstraps, resolves, and registers in catalog', async () => {
    await useStore.getState().bootstrapRemoteCatalog()
    expect(useStore.getState().remoteIndexes.polyhaven.status).toBe('ready')
    expect(useStore.getState().remoteIndexes.polyhaven.entries[0].slug).toBe('wood')
    await useStore.getState().resolveRemoteAsset(sample, '2k')
    const def = useStore.getState().resolvedRemoteMaterials['polyhaven:wood:2k']
    expect(def).toBeDefined()
    expect(def.kind).toBe('textured')
    expect(def.source).toBe('polyhaven')
  })
})
