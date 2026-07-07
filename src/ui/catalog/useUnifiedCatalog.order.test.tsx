// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { RemoteEntry } from '../../catalog/remote/types'
import type { RemoteGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { gridItemId, useUnifiedCatalog } from './useUnifiedCatalog'

/**
 * STABLE-CATALOG-ORDER: downloading a card must NOT move it. A resolved remote
 * entry renders its local def at the remote slot; an imported shared item renders
 * its local def at the shared slot — so the grid index is preserved across the
 * download instead of the card jumping into the leading local block.
 */

const sharedItem: SharedLibraryItem = {
  group: 'alex',
  groupKey: 'alex',
  name: 'ALEX Desk',
  type: 'Desk',
  category: 'tables',
  size: '',
  series: 'ALEX',
  variants: 2,
  thumbnail: 'a.jpg',
  price: 199,
  currency: 'SGD',
}

const remoteEntry: RemoteEntry = {
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

function seedShared(items: SharedLibraryItem[]) {
  useStore.setState((s) => ({ sharedLibrary: { ...s.sharedLibrary, status: 'ready', items } }))
}
function seedRemote(entries: RemoteEntry[]) {
  useStore.setState((s) => ({
    remoteIndexes: { ...s.remoteIndexes, polyhaven: { status: 'ready', entries } },
  }))
}
function resolveDef(id: string, category: string) {
  const def = { id, category, name: id } as unknown as RemoteGltfDef
  useStore.setState((s) => ({
    resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, [id]: def },
  }))
}

describe('useUnifiedCatalog — stable order across download', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('(a) a shared item keeps its grid index after import', () => {
    seedShared([sharedItem])
    const before = renderHook(() => useUnifiedCatalog(true, true))
    const idxBefore = before.result.current.byCategory.tables.findIndex(
      (it) => it.kind === 'shared' && it.item.groupKey === 'alex',
    )
    expect(idxBefore).toBeGreaterThanOrEqual(0)

    // Import it: its `ikea-alex` local def now resolves.
    resolveDef('ikea-alex', 'tables')
    const after = renderHook(() => useUnifiedCatalog(true, true))
    const cards = after.result.current.byCategory.tables
    const idxAfter = cards.findIndex((it) => it.kind === 'local' && it.def.id === 'ikea-alex')
    expect(idxAfter).toBe(idxBefore) // same slot — no jump
    expect(cards.some((it) => it.kind === 'shared' && it.item.groupKey === 'alex')).toBe(false)
  })

  it('(b) a resolved remote entry keeps its grid index after download', () => {
    seedRemote([remoteEntry])
    const before = renderHook(() => useUnifiedCatalog(true, true))
    const idxBefore = before.result.current.byCategory.seating.findIndex(
      (it) => it.kind === 'remote' && it.entry.slug === 'cozy_sofa',
    )
    expect(idxBefore).toBeGreaterThanOrEqual(0)

    // Download it: the resolved `provider:slug:resolution` local def now exists.
    resolveDef('polyhaven:cozy_sofa:2k', 'seating')
    const after = renderHook(() => useUnifiedCatalog(true, true))
    const cards = after.result.current.byCategory.seating
    const idxAfter = cards.findIndex(
      (it) => it.kind === 'local' && it.def.id === 'polyhaven:cozy_sofa:2k',
    )
    expect(idxAfter).toBe(idxBefore) // same slot — no jump
    expect(cards.some((it) => it.kind === 'remote' && it.entry.slug === 'cozy_sofa')).toBe(false)
  })

  it('(c) with includeShared=false the imported def still appears in the local block', () => {
    seedShared([sharedItem])
    resolveDef('ikea-alex', 'tables')
    const { result } = renderHook(() => useUnifiedCatalog(true, false))
    const cards = result.current.byCategory.tables
    // The shared library isn't loaded → the def stays a normal local card, and no
    // shared card surfaces (today's behaviour, unchanged).
    expect(cards.some((it) => it.kind === 'local' && it.def.id === 'ikea-alex')).toBe(true)
    expect(cards.some((it) => it.kind === 'shared')).toBe(false)
    // It sits in the leading local block (no relocation), i.e. no shared/remote
    // card precedes… there are none anyway, so simply assert it's a local card.
    const idx = cards.findIndex((it) => it.kind === 'local' && it.def.id === 'ikea-alex')
    expect(idx).toBeGreaterThanOrEqual(0)
  })

  it('(d) no card appears twice after a mix of resolve + import', () => {
    seedShared([sharedItem])
    seedRemote([remoteEntry])
    resolveDef('ikea-alex', 'tables')
    resolveDef('polyhaven:cozy_sofa:2k', 'seating')
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    const ids = result.current.all.map(gridItemId)
    expect(new Set(ids).size).toBe(ids.length)
    // And the counts stay in lock-step with the flattened list.
    const total = Object.values(result.current.counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(result.current.all.length)
  })
})
