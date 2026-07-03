// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { useCatalog, useCatalogByCategory } from './catalog'
import type { UserGltfDef } from './types'

/**
 * An imported user GLB must show up as a first-class catalog entry: merged
 * into the flat catalog (for placement/inspector lookup) AND grouped under
 * its `category` (so the drawer renders a card for it). This guards the
 * end-to-end wiring the catalog drawer relies on.
 */
const USER_DEF: UserGltfDef = {
  id: 'user:test-chair',
  name: 'My Imported Chair',
  kind: 'gltf',
  source: 'user',
  category: 'seating',
  assetId: 'asset-123',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  defaultFootprint: { w: 0.6, d: 0.6, h: 0.9 },
  keywords: ['armchair'],
}

describe('catalog surfaces imported user GLB defs', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('merges a user def into the flat catalog under its own id', () => {
    const { result } = renderHook(() => useCatalog())
    expect(result.current[USER_DEF.id]).toBeUndefined()

    act(() => useStore.getState().addUserFurniture(USER_DEF))
    expect(result.current[USER_DEF.id]?.name).toBe('My Imported Chair')
  })

  it('groups a user def under its category (so the drawer renders a card)', () => {
    const { result } = renderHook(() => useCatalogByCategory())
    expect(result.current.seating.map((d) => d.id)).not.toContain(USER_DEF.id)

    act(() => useStore.getState().addUserFurniture(USER_DEF))
    expect(result.current.seating.map((d) => d.id)).toContain(USER_DEF.id)
  })
})
