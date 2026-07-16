import { beforeEach, describe, expect, it, vi } from 'vitest'

// IDB + object-URL stubs (jsdom has neither).
const idbDelete = vi.fn().mockResolvedValue(undefined)
vi.mock('../storage/IdbAssetStore', () => ({
  IdbAssetStore: { delete: (...a: unknown[]) => idbDelete(...a), put: vi.fn() },
}))
;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()

import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { getCachedGltfFootprint, seedGltfFootprint } from '../../furniture/GltfModel'
import {
  __resetSrcRefCacheForTest,
  getCachedSrcRefGeometry,
  populateSrcRefCacheFromScene,
} from '../../furniture/glbEdit/srcRefCache'
import type { FurnitureItem, IkeaGltfDef } from '../../furniture/types'
import { useStore } from '../store'

/** A one-mesh scene to seed the srcRef cache for a def. */
function oneMeshScene(): Group {
  const root = new Group()
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  m.name = 'body'
  root.add(m)
  return root
}

function ikeaDef(overrides: Partial<IkeaGltfDef> = {}): IkeaGltfDef {
  return {
    id: 'ikea-malm',
    name: 'MALM',
    category: 'beds',
    kind: 'gltf',
    source: 'ikea',
    groupKey: 'malm',
    activeVariant: 'black-brown',
    variants: [
      {
        finish: 'black-brown',
        label: 'Black-brown',
        articleNumber: '1',
        url: 'u',
        assetId: 'asset-old',
        runtimeUrl: 'blob:old',
        glbMaterials: [],
      },
    ],
    defaultFootprint: { w: 1, d: 2, h: 1 },
    uploadedAt: '2026-01-01',
    license: 'IKEA',
    attribution: 'IKEA — imported model',
    ...overrides,
  }
}

function placed(id: string, defId: string): FurnitureItem {
  return { id, defId, position: [1, 1], rotation: 0, props: { variant: 'black-brown' } }
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  __resetSrcRefCacheForTest()
  idbDelete.mockClear()
  ;(URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear()
})

describe('removeUserFurniture — GLTF + module cache eviction (PERF-001/008)', () => {
  it('prunes the footprint cache for the removed def url (clears parsed GPU caches)', () => {
    const def = ikeaDef()
    // The IKEA fixture's single variant runtimeUrl.
    seedGltfFootprint('blob:old', { w: 1, d: 2, h: 1, anchorOffset: [0, 0, 0] })
    expect(getCachedGltfFootprint('blob:old')).not.toBeNull()
    useStore.getState().addUserFurniture(def)
    useStore.getState().setItems([placed('p1', 'ikea-malm')])

    useStore.getState().removeUserFurniture('ikea-malm')

    // Module-level footprint cache entry for the removed asset is gone.
    expect(getCachedGltfFootprint('blob:old')).toBeNull()
    // ...and its blob url was revoked / IDB record deleted (existing behaviour).
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old')
    expect(idbDelete).toHaveBeenCalledWith('asset-old')
  })

  it('is a no-op for a def that was never loaded (no cached footprint)', () => {
    useStore.getState().addUserFurniture(ikeaDef())
    expect(() => useStore.getState().removeUserFurniture('ikea-malm')).not.toThrow()
  })

  it('deletes every variant blob, drops its placed items (keeps others), and clears selection', () => {
    const twoVariant = ikeaDef({
      variants: [
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '1',
          url: 'u',
          assetId: 'asset-a',
          runtimeUrl: 'blob:a',
          glbMaterials: [],
        },
        {
          finish: 'white',
          label: 'White',
          articleNumber: '2',
          url: 'u',
          assetId: 'asset-b',
          runtimeUrl: 'blob:b',
          glbMaterials: [],
        },
      ],
    })
    useStore.getState().addUserFurniture(twoVariant)
    useStore
      .getState()
      .setItems([
        placed('i1', 'ikea-malm'),
        placed('i2', 'ikea-malm'),
        placed('keep', 'dining-chair'),
      ])
    useStore.setState({ selectedItemId: 'i1', selectedItemIds: ['i1', 'i2'] })

    useStore.getState().removeUserFurniture('ikea-malm')

    const after = useStore.getState()
    expect(after.userFurniture.find((d) => d.id === 'ikea-malm')).toBeUndefined()
    // Its placed instances are dropped; the unrelated item survives.
    expect(after.items.map((i) => i.id)).toEqual(['keep'])
    // Selection no longer references the removed items.
    expect(after.selectedItemId).toBeNull()
    expect(after.selectedItemIds).toEqual([])
    // Both variants' IDB records + blob URLs are freed.
    expect(idbDelete).toHaveBeenCalledWith('asset-a')
    expect(idbDelete).toHaveBeenCalledWith('asset-b')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b')
  })
})

describe('replaceUserFurniture', () => {
  it('swaps the def in place and KEEPS placed instances (no data loss)', () => {
    const oldDef = ikeaDef()
    useStore.getState().addUserFurniture(oldDef)
    useStore.getState().setItems([placed('p1', 'ikea-malm'), placed('p2', 'ikea-malm')])

    const newDef = ikeaDef({
      name: 'MALM (re-imported)',
      variants: [
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '1',
          url: 'u',
          assetId: 'asset-new',
          runtimeUrl: 'blob:new',
          glbMaterials: [],
        },
      ],
    })
    useStore.getState().replaceUserFurniture(newDef)

    // Placed instances survive and still reference the (stable) def id.
    const items = useStore.getState().items
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.defId === 'ikea-malm')).toBe(true)

    // The def itself was replaced (one entry, the new one).
    const defs = useStore.getState().userFurniture.filter((d) => d.id === 'ikea-malm')
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('MALM (re-imported)')

    // Old variant resources cleaned up.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old')
    expect(idbDelete).toHaveBeenCalledWith('asset-old')
  })

  it('does not revoke a blob URL that the new def still uses', () => {
    const shared = ikeaDef({
      variants: [
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '1',
          url: 'u',
          assetId: 'asset-keep',
          runtimeUrl: 'blob:keep',
          glbMaterials: [],
        },
      ],
    })
    useStore.getState().addUserFurniture(shared)
    // Re-import resolved to the SAME assetId/runtimeUrl (e.g. nothing changed).
    useStore.getState().replaceUserFurniture(
      ikeaDef({
        name: 'same',
        variants: [
          {
            finish: 'black-brown',
            label: 'Black-brown',
            articleNumber: '1',
            url: 'u',
            assetId: 'asset-keep',
            runtimeUrl: 'blob:keep',
            glbMaterials: [],
          },
        ],
      }),
    )
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:keep')
    expect(idbDelete).not.toHaveBeenCalledWith('asset-keep')
  })

  it('appends like add when no existing def shares the id', () => {
    useStore.getState().replaceUserFurniture(ikeaDef({ id: 'ikea-new' }))
    expect(useStore.getState().userFurniture.map((d) => d.id)).toContain('ikea-new')
  })

  it('evicts the def’s cached srcRef geometry (a replaced GLB is a different model)', () => {
    useStore.getState().addUserFurniture(ikeaDef({ id: 'ikea-malm' }))
    // Seed decompose-resolved geometry keyed by the def id (Stage 9a designer path).
    populateSrcRefCacheFromScene('ikea-malm', oneMeshScene())
    const ref = { defId: 'ikea-malm', meshPath: '0' }
    expect(getCachedSrcRefGeometry(ref)).not.toBeNull()

    useStore.getState().replaceUserFurniture(ikeaDef({ id: 'ikea-malm', name: 'v2' }))

    // The stale geometry is gone — a re-resolution must re-load the new GLB.
    expect(getCachedSrcRefGeometry(ref)).toBeNull()
  })
})

describe('addManyUserFurniture', () => {
  it('appends a batch in a SINGLE store write (one userFurniture identity change)', () => {
    let writes = 0
    const unsub = useStore.subscribe((s, prev) => {
      if (s.userFurniture !== prev.userFurniture) writes++
    })
    useStore
      .getState()
      .addManyUserFurniture([
        ikeaDef({ id: 'ikea-a' }),
        ikeaDef({ id: 'ikea-b' }),
        ikeaDef({ id: 'ikea-c' }),
      ])
    unsub()
    expect(writes).toBe(1)
    expect(
      useStore
        .getState()
        .userFurniture.map((d) => d.id)
        .sort(),
    ).toEqual(['ikea-a', 'ikea-b', 'ikea-c'])
  })

  it('upserts: replaces existing ids in place, appends new ones, keeps placements', () => {
    useStore.getState().addUserFurniture(ikeaDef({ id: 'ikea-malm' }))
    useStore.setState({ items: [placed('i1', 'ikea-malm')] })
    useStore
      .getState()
      .addManyUserFurniture([
        ikeaDef({ id: 'ikea-malm', name: 'MALM v2' }),
        ikeaDef({ id: 'ikea-new' }),
      ])
    const fur = useStore.getState().userFurniture
    expect(fur.map((d) => d.id).sort()).toEqual(['ikea-malm', 'ikea-new'])
    expect(fur.find((d) => d.id === 'ikea-malm')?.name).toBe('MALM v2')
    // placement survives the upsert
    expect(useStore.getState().items.map((i) => i.id)).toEqual(['i1'])
  })

  it('frees resources of a replaced def the new one no longer references', () => {
    useStore.getState().addUserFurniture(
      ikeaDef({
        id: 'ikea-malm',
        variants: [
          {
            finish: 'f',
            label: 'F',
            articleNumber: '1',
            url: 'u',
            assetId: 'asset-old',
            runtimeUrl: 'blob:old',
            glbMaterials: [],
          },
        ],
      }),
    )
    useStore.getState().addManyUserFurniture([
      ikeaDef({
        id: 'ikea-malm',
        variants: [
          {
            finish: 'f',
            label: 'F',
            articleNumber: '1',
            url: 'u',
            assetId: 'asset-new',
            runtimeUrl: 'blob:new',
            glbMaterials: [],
          },
        ],
      }),
    ])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old')
    expect(idbDelete).toHaveBeenCalledWith('asset-old')
  })

  it('is a no-op for an empty batch', () => {
    let writes = 0
    const unsub = useStore.subscribe((s, prev) => {
      if (s.userFurniture !== prev.userFurniture) writes++
    })
    useStore.getState().addManyUserFurniture([])
    unsub()
    expect(writes).toBe(0)
  })
})
