import { describe, expect, it } from 'vitest'
import type { UserGltfDef } from '../types'
import { buildOverwriteDef, placementFlags } from './saveAsset'

describe('placementFlags', () => {
  it('floor → no special flags', () => {
    expect(placementFlags('floor')).toEqual({})
  })
  it('wall → mounted (skips wall-body collision)', () => {
    expect(placementFlags('wall')).toEqual({ mounted: true })
  })
  it('floor-covering → noClip (rug-style, never blocks)', () => {
    expect(placementFlags('floorCovering')).toEqual({ noClip: true })
  })
})

describe('buildOverwriteDef', () => {
  const fresh: UserGltfDef = {
    id: 'user-new-asset',
    name: 'fresh',
    category: 'others',
    kind: 'gltf',
    source: 'user',
    assetId: 'asset-new',
    uploadedAt: '2026-06-10T00:00:00.000Z',
    defaultFootprint: { w: 1, d: 2, h: 0.5 },
    runtimeUrl: 'blob:new',
  }

  it('re-homes the fresh def under the existing id, keeping its new blob/footprint', () => {
    const def = buildOverwriteDef(fresh, 'user-original', 'My chair', 'seating')
    // Placed instances reference the original id — it must be preserved.
    expect(def.id).toBe('user-original')
    // …but the geometry/blob is the freshly-exported one.
    expect(def.assetId).toBe('asset-new')
    expect(def.runtimeUrl).toBe('blob:new')
    expect(def.defaultFootprint).toEqual({ w: 1, d: 2, h: 0.5 })
    // …with the chosen name + category.
    expect(def.name).toBe('My chair')
    expect(def.category).toBe('seating')
  })

  it('falls back to a default name when blank', () => {
    expect(buildOverwriteDef(fresh, 'id', '   ', 'others').name).toBe('Custom asset')
  })
})
