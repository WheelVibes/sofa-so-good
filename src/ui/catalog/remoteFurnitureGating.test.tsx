// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteEntry } from '../../catalog/remote/types'
import { buildMergedCatalog } from '../../furniture/catalog'
import type { RemoteGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { useUnifiedCatalog } from './useUnifiedCatalog'

/**
 * AI-INTEG-001a — the browsable CC0 *model* cards (Poly Haven) merge into the
 * catalog grid only via `useUnifiedCatalog(includeRemote)`, where `includeRemote`
 * comes from the `remoteFurniture` feature flag (pro tier → off in Simple mode).
 * These tests assert the gate at the hook boundary independent of the React DOM
 * tree (the flag/tier resolution itself is covered in `features/featureFlags.test.ts`).
 */

const sofa: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'cozy_sofa',
  kind: 'furniture',
  name: 'Cozy Sofa',
  category: 'seating',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: 'Poly Haven',
  sourceUrl: 'https://polyhaven.com/a/cozy_sofa',
}

function seedRemoteIndex() {
  useStore.setState((s) => ({
    remoteIndexes: {
      ...s.remoteIndexes,
      polyhaven: { status: 'ready', entries: [sofa] },
    },
  }))
}

describe('remote-furniture catalog gating (AI-INTEG-001a)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    seedRemoteIndex()
  })

  const remoteCards = (cat: ReturnType<typeof useUnifiedCatalog>) =>
    cat.all.filter((it) => it.kind === 'remote')

  it('Pro mode (includeRemote=true): the remote CC0 model surfaces in the grid', () => {
    const { result } = renderHook(() => useUnifiedCatalog(true))
    const remotes = remoteCards(result.current)
    expect(remotes.length).toBe(1)
    expect(remotes[0].kind === 'remote' && remotes[0].entry.slug).toBe('cozy_sofa')
    // It lands in its mapped FurnitureCategory.
    expect(
      result.current.byCategory.seating.some(
        (it) => it.kind === 'remote' && it.entry.slug === 'cozy_sofa',
      ),
    ).toBe(true)
  })

  it('Simple mode (includeRemote=false): no remote model surfaces in the grid', () => {
    const { result } = renderHook(() => useUnifiedCatalog(false))
    expect(remoteCards(result.current).length).toBe(0)
    expect(result.current.byCategory.seating.some((it) => it.kind === 'remote')).toBe(false)
    // The curated local catalog is unaffected — built-ins still populate the grid.
    expect(result.current.all.some((it) => it.kind === 'local')).toBe(true)
  })

  it('a placed/resolved remote model still renders with the flag OFF (browse-only gate)', () => {
    // Simulate the model having been downloaded earlier: a resolved def exists in
    // `resolvedRemoteFurniture` (this is what a placed item's defId resolves to).
    const key = 'polyhaven:cozy_sofa:2k'
    const resolvedDef = {
      id: key,
      kind: 'gltf',
      source: 'remote',
      name: 'Cozy Sofa',
      category: 'seating',
      url: 'blob:cozy',
      defaultFootprint: { w: 1, d: 1, h: 1 },
      license: 'CC0',
      attribution: 'Poly Haven',
    } as unknown as RemoteGltfDef
    useStore.setState((s) => ({
      resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, [key]: resolvedDef },
    }))

    // The scene render path (`buildMergedCatalog`, used by `useCatalog`) merges
    // resolved remote defs UNCONDITIONALLY — independent of the browse flag — so a
    // placed item keeps rendering even when remote browsing is off.
    const merged = buildMergedCatalog({
      userFurniture: [],
      resolvedRemoteFurniture: useStore.getState().resolvedRemoteFurniture,
      packFurniture: [],
    })
    expect(merged[key]).toBeDefined()
    expect(merged[key].id).toBe(key)

    // And in the grid with browsing OFF: the un-downloaded entry is hidden, while
    // the resolved def appears as a normal local card (it is no longer "remote").
    const { result } = renderHook(() => useUnifiedCatalog(false))
    expect(remoteCards(result.current).length).toBe(0)
    expect(
      result.current.byCategory.seating.some((it) => it.kind === 'local' && it.def.id === key),
    ).toBe(true)
  })
})
