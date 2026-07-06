import { describe, expect, it } from 'vitest'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import type { FurnitureDef, IkeaGltfDef } from '../../furniture/types'
import { sharedGroupForDef } from './sharedGroupForDef'

const item = (group: string, groupKey: string): SharedLibraryItem => ({
  group,
  groupKey,
  name: 'x',
  type: '',
  category: 'seating',
  size: '',
  series: '',
  variants: 1,
  thumbnail: null,
  price: null,
  currency: null,
})

const ikea = (groupKey: string): IkeaGltfDef => ({
  id: `ikea-${groupKey}`,
  name: 'X',
  category: 'seating',
  kind: 'gltf',
  source: 'ikea',
  groupKey,
  activeVariant: 'a',
  variants: [],
  defaultFootprint: { w: 1, d: 1, h: 1 },
  uploadedAt: '',
  license: 'IKEA',
  attribution: '',
})

const builtin: FurnitureDef = {
  id: 'sofa',
  name: 'Sofa',
  category: 'seating',
  kind: 'gltf',
  source: 'builtin',
  url: '/m.glb',
  license: 'CC0',
  defaultFootprint: { w: 1, d: 1, h: 1 },
}

describe('sharedGroupForDef', () => {
  it('returns the folder slug when a manifest item groupKey matches (slug != groupKey)', () => {
    expect(sharedGroupForDef(ikea('agen'), [item('agen-folder', 'agen')])).toBe('agen-folder')
  })

  it('returns null when no manifest item matches the def groupKey', () => {
    expect(sharedGroupForDef(ikea('agen'), [item('malm-folder', 'malm')])).toBeNull()
  })

  it('returns null for a non-ikea (builtin) def', () => {
    expect(sharedGroupForDef(builtin, [item('sofa', 'sofa')])).toBeNull()
  })

  it('returns null when the manifest is empty', () => {
    expect(sharedGroupForDef(ikea('agen'), [])).toBeNull()
  })
})
