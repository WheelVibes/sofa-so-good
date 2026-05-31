import { describe, expect, it, vi } from 'vitest'

const blob = new Blob([new Uint8Array(8)], { type: 'model/gltf-binary' })
vi.mock('./IdbAssetStore', () => ({
  IdbAssetStore: {
    get: vi.fn(async (id: string) => (id === 'a1' ? { assetId: 'a1', blob } : null)),
  },
}))

import type { IkeaGltfDef } from '../../furniture/types'
import { resolveIkeaRuntimeUrls } from './hydrateAssets'

describe('resolveIkeaRuntimeUrls', () => {
  it('sets runtimeUrl for variants with an assetId, leaves stubs null', async () => {
    ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(
      () => 'blob:resolved',
    )
    const def: IkeaGltfDef = {
      id: 'ikea-malm',
      name: 'MALM',
      category: 'beds',
      kind: 'gltf',
      source: 'ikea',
      groupKey: 'malm',
      activeVariant: 'bb',
      variants: [
        {
          finish: 'bb',
          label: 'BB',
          articleNumber: '1',
          url: 'u',
          assetId: 'a1',
          footprint: { w: 1, d: 2, h: 1, anchorOffset: [0, 0.5, 0] },
          glbMaterials: [],
        },
        {
          finish: 'white',
          label: 'White',
          articleNumber: '2',
          url: 'u',
          assetId: null,
          glbMaterials: [],
        },
      ],
      defaultFootprint: { w: 1, d: 2, h: 1 },
      uploadedAt: 'x',
      license: 'IKEA',
      attribution: 'IKEA',
    }
    const [out] = await resolveIkeaRuntimeUrls([def])
    expect(out.variants[0].runtimeUrl).toBe('blob:resolved')
    expect(out.variants[1].runtimeUrl).toBeUndefined()
  })
})
