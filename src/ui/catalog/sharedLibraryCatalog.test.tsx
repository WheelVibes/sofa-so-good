// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { RemoteGltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { useUnifiedCatalog } from './useUnifiedCatalog'

const item: SharedLibraryItem = {
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

function seedShared(items: SharedLibraryItem[]) {
  useStore.setState((s) => ({ sharedLibrary: { ...s.sharedLibrary, status: 'ready', items } }))
}

const sharedCards = (cat: ReturnType<typeof useUnifiedCatalog>) =>
  cat.all.filter((it) => it.kind === 'shared')

describe('shared-library catalog merge', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('Pro (includeShared=true): the library item surfaces in its mapped category', () => {
    seedShared([item])
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(sharedCards(result.current).length).toBe(1)
    expect(
      result.current.byCategory.tables.some(
        (it) => it.kind === 'shared' && it.item.groupKey === 'alex',
      ),
    ).toBe(true)
  })

  it('Simple (includeShared=false): no library item surfaces', () => {
    seedShared([item])
    const { result } = renderHook(() => useUnifiedCatalog(true, false))
    expect(sharedCards(result.current).length).toBe(0)
    expect(result.current.all.some((it) => it.kind === 'local')).toBe(true)
  })

  it('dedups a library item whose ikea-<groupKey> def is already imported', () => {
    seedShared([item])
    // A resolved def with the imported id appears as a local card (see remote
    // gating test): the shared card must not duplicate it.
    const def = {
      id: 'ikea-alex',
      category: 'tables',
      name: 'ALEX Desk',
    } as unknown as RemoteGltfDef
    useStore.setState((s) => ({
      resolvedRemoteFurniture: { ...s.resolvedRemoteFurniture, 'ikea-alex': def },
    }))
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(sharedCards(result.current).length).toBe(0)
    expect(
      result.current.byCategory.tables.some(
        (it) => it.kind === 'local' && it.def.id === 'ikea-alex',
      ),
    ).toBe(true)
  })

  it('an unknown category maps to "others"', () => {
    seedShared([{ ...item, groupKey: 'x', group: 'x', category: 'nonsense' }])
    const { result } = renderHook(() => useUnifiedCatalog(true, true))
    expect(
      result.current.byCategory.others.some(
        (it) => it.kind === 'shared' && it.item.groupKey === 'x',
      ),
    ).toBe(true)
  })
})
