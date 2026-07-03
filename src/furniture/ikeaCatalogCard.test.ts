// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { useCatalog, useCatalogByCategory } from './catalog'
import type { IkeaGltfDef } from './types'

/**
 * An imported IKEA group must surface as a SINGLE first-class catalog entry:
 * merged into the flat catalog (for placement/inspector lookup) AND grouped
 * under its `category` (so the drawer renders exactly ONE card for the whole
 * group, with its variants[] selectable in the inspector). This guards the
 * end-to-end wiring the catalog drawer relies on for IKEA defs.
 *
 * We construct the def directly rather than running importGroup (which needs
 * IndexedDB + blobs); this mirrors the catalogUserDefs.test.ts harness.
 */
const IKEA_DEF: IkeaGltfDef = {
  id: 'ikea-malm-bed-frame-high-90x200',
  name: 'MALM bed frame, high',
  category: 'beds',
  kind: 'gltf',
  source: 'ikea',
  groupKey: 'malm-bed-frame-high',
  activeVariant: 'white',
  variants: [
    {
      finish: 'white',
      label: 'White',
      articleNumber: '002.495.55',
      url: 'https://www.ikea.com/sg/en/p/malm-bed-frame-high-white-00249555/',
      assetId: 'ikea-asset-1',
      runtimeUrl: 'blob:http://localhost/ikea-malm-white',
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 0.97, d: 2.09, h: 1.0 },
  uploadedAt: '2026-05-31T00:00:00.000Z',
  license: 'IKEA',
  attribution: 'IKEA — MALM bed frame, high',
}

describe('catalog surfaces an imported IKEA group as one card', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('merges an IKEA def into the flat catalog under its own id', () => {
    const { result } = renderHook(() => useCatalog())
    expect(result.current[IKEA_DEF.id]).toBeUndefined()

    act(() => useStore.getState().addUserFurniture(IKEA_DEF))
    expect(result.current[IKEA_DEF.id]?.name).toBe('MALM bed frame, high')
  })

  it('groups an IKEA def under its category (so the drawer renders ONE card)', () => {
    const { result } = renderHook(() => useCatalogByCategory())
    expect(result.current.beds.map((d) => d.id)).not.toContain(IKEA_DEF.id)

    act(() => useStore.getState().addUserFurniture(IKEA_DEF))
    const beds = result.current.beds.filter((d) => d.id === IKEA_DEF.id)
    expect(beds).toHaveLength(1)
    expect(beds[0].name).toBe('MALM bed frame, high')
  })
})
