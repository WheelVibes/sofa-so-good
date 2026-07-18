import { describe, expect, it } from 'vitest'
import { FURNITURE_CATEGORIES } from '../../../src/furniture/types'
import {
  KENNEY_FURNITURE_KIT,
  kenneyAttribution,
  kenneyZipEntryPath,
  slugify,
} from '../kenney-select.mjs'

describe('KENNEY_FURNITURE_KIT curated set', () => {
  it('every item has a known FurnitureCategory subdir', () => {
    for (const item of KENNEY_FURNITURE_KIT.items) {
      expect(FURNITURE_CATEGORIES).toContain(item.category)
    }
  })

  it('every item slug is unique within the curated set', () => {
    const slugs = KENNEY_FURNITURE_KIT.items.map((it) => slugify(it.name))
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every item has a non-empty glb stem and display name', () => {
    for (const item of KENNEY_FURNITURE_KIT.items) {
      expect(item.glb.length).toBeGreaterThan(0)
      expect(item.name.length).toBeGreaterThan(0)
    }
  })
})

describe('kenneyZipEntryPath', () => {
  it("points at the kit's GLTF-format subfolder", () => {
    expect(kenneyZipEntryPath('bedDouble')).toBe('Models/GLTF format/bedDouble.glb')
  })
})

describe('kenneyAttribution', () => {
  it('records the item name, CC0 license, and kit name', () => {
    const s = kenneyAttribution({ name: 'Double Bed' }, 'furniture-kit')
    expect(s).toContain('Double Bed')
    expect(s).toContain('CC0')
    expect(s).toContain('furniture-kit')
  })
})
