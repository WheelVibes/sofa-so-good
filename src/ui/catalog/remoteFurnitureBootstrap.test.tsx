// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { useStore } from '../../state/store'

/**
 * AI-INTEG-001a — when remote browsing is OFF (Simple mode forces both
 * `remoteFurniture` and `remoteMaterials` off), the catalog drawer must NOT
 * bootstrap the remote provider index, i.e. it must not hit the network.
 */

const { fetchIndex } = vi.hoisted(() => ({ fetchIndex: vi.fn(async () => []) }))

vi.mock('../../catalog/remote/providers', () => ({
  activeProviderIds: () => ['polyhaven'],
  PROD_PROVIDER_IDS: ['polyhaven'],
  PROVIDERS: {
    polyhaven: {
      id: 'polyhaven',
      fetchIndex,
      fetchThumbnail: vi.fn(async () => new Blob(['t'])),
      fetchAsset: vi.fn(async () => ({ kind: 'furniture', gltfJson: {}, bin: new Blob() })),
    },
  },
}))

// The thumbnail host mounts an R3F <Canvas> (no WebGL in jsdom) and the cards
// pull GLB-thumbnail rendering — none of that is under test here. We only care
// that the bootstrap *effect* runs (or doesn't) for the resolved flags.
vi.mock('./thumbnails', () => ({ ThumbnailHost: () => null }))
vi.mock('./CatalogCard', () => ({ CatalogCard: () => null }))
vi.mock('./RemoteCard', () => ({ RemoteCard: () => null }))

import { CatalogDrawer } from './CatalogDrawer'

/** Put the store into the state where the drawer actually renders (open catalog
 *  inside the per-room orbit editor) with a clean, idle remote index. */
function openDrawer() {
  useStore.setState({
    catalogOpen: true,
    cameraMode: 'orbit',
    roomEditor: { active: true, roomId: 'living' },
    remoteIndexes: {
      polyhaven: { status: 'idle', entries: [] },
      ambientcg: { status: 'idle', entries: [] },
    },
  } as never)
}

describe('CatalogDrawer remote bootstrap gating (AI-INTEG-001a)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    fetchIndex.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does NOT fetch the remote index in Simple mode (both browse flags off)', async () => {
    useStore.getState().setUiMode('simple')
    expect(useStore.getState().featureFlags.remoteFurniture).toBe(false)
    expect(useStore.getState().featureFlags.remoteMaterials).toBe(false)
    openDrawer()
    render(<CatalogDrawer />)
    // Give the (gated) bootstrap effect ample time to run if it were going to —
    // long enough that a broken gate would have driven the fetch.
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchIndex).not.toHaveBeenCalled()
    expect(useStore.getState().remoteIndexes.polyhaven.status).toBe('idle')
  })

  it('DOES fetch the remote index in Pro mode (remoteFurniture on)', async () => {
    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.remoteFurniture).toBe(true)
    openDrawer()
    render(<CatalogDrawer />)
    // bootstrapRemoteCatalog is async (IDB meta read → per-provider getIndex →
    // fetchIndex); poll briefly until the gated effect has driven the fetch.
    await vi.waitFor(() => expect(fetchIndex).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('confirms the flag resolution this gate relies on (both modes)', () => {
    expect(resolveFlags(true, {}, false, 'simple').remoteFurniture).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').remoteFurniture).toBe(true)
  })
})
