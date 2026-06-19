import { beforeEach, describe, expect, it, vi } from 'vitest'

;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()

import { getCachedGltfFootprint, seedGltfFootprint } from '../../furniture/GltfModel'
import type { FurnitureItem, PackGltfDef } from '../../furniture/types'
import { useStore } from '../store'

function packDef(overrides: Partial<PackGltfDef> = {}): PackGltfDef {
  return {
    id: 'pack-chair',
    name: 'Pack Chair',
    category: 'seating',
    kind: 'gltf',
    source: 'pack',
    packId: 'cc0-pack',
    entryId: 'chair',
    defaultFootprint: { w: 1, d: 1, h: 1 },
    runtimeUrl: 'blob:pack-chair',
    thumbUrl: 'blob:pack-chair-thumb',
    license: 'CC0',
    attribution: 'CC0 pack',
    sourceUrl: '',
    ...overrides,
  }
}

function placed(id: string, defId: string): FurnitureItem {
  return { id, defId, position: [1, 1], rotation: 0, props: {} }
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  ;(URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear()
})

describe('markPackUninstalled — GLTF + module cache eviction (PERF-001/008)', () => {
  it('evicts + revokes a removed pack def with no placed instances', () => {
    seedGltfFootprint('blob:pack-chair', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    useStore.getState().setPackFurniture([packDef()])

    useStore.getState().markPackUninstalled('cc0-pack')

    // Def removed from the store.
    expect(useStore.getState().packFurniture).toHaveLength(0)
    // Module footprint cache pruned, blob urls revoked.
    expect(getCachedGltfFootprint('blob:pack-chair')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pack-chair')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pack-chair-thumb')
  })

  it('does NOT evict a pack def still referenced by a placed (orphaned) item', () => {
    seedGltfFootprint('blob:pack-chair', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    useStore.getState().setPackFurniture([packDef()])
    useStore.setState({ items: [placed('i1', 'pack-chair')] })

    useStore.getState().markPackUninstalled('cc0-pack')

    // Still-in-use asset's GPU cache + blob url are preserved (no broken item).
    expect(getCachedGltfFootprint('blob:pack-chair')).not.toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:pack-chair')
  })

  it('only evicts defs of the uninstalled pack, leaving other packs intact', () => {
    seedGltfFootprint('blob:pack-chair', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    seedGltfFootprint('blob:other', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] })
    useStore
      .getState()
      .setPackFurniture([
        packDef(),
        packDef({ id: 'other-chair', packId: 'other-pack', runtimeUrl: 'blob:other' }),
      ])

    useStore.getState().markPackUninstalled('cc0-pack')

    expect(getCachedGltfFootprint('blob:pack-chair')).toBeNull()
    expect(getCachedGltfFootprint('blob:other')).not.toBeNull()
    expect(useStore.getState().packFurniture.map((d) => d.id)).toEqual(['other-chair'])
  })
})
