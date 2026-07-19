import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { defaultLayout } from './defaultLayout'
import { ITEM_PRICE, itemPrice } from './furniturePrices'
import type { FurnitureDef, IkeaGltfDef } from './types'

const ikea: IkeaGltfDef = {
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
      price: 204,
      glbMaterials: [],
    },
  ],
  defaultFootprint: { w: 1, d: 2, h: 1 },
  uploadedAt: 'x',
  license: 'IKEA',
  attribution: 'IKEA',
}

describe('itemPrice', () => {
  it('uses the IKEA active-variant price', () => {
    expect(itemPrice(ikea, 'beds')).toBe(204)
  })

  it('falls back to per-item then category for non-IKEA', () => {
    const bed = { id: 'bed-queen', category: 'beds' } as FurnitureDef
    expect(itemPrice(bed, 'beds')).toBe(900) // ITEM_PRICE['bed-queen']
    const unknown = { id: 'nope', category: 'tables' } as FurnitureDef
    expect(itemPrice(unknown, 'tables')).toBe(240) // CATEGORY_BASE.tables
  })

  it('falls back to category when an IKEA active variant has no price', () => {
    const noPrice = {
      ...ikea,
      variants: [{ ...ikea.variants[0], price: undefined }],
    } as IkeaGltfDef
    expect(itemPrice(noPrice, 'beds')).toBe(650) // CATEGORY_BASE.beds
  })

  it('prices the per-INSTANCE variant when one is given (not just the def default)', () => {
    const twoVariant = {
      ...ikea,
      activeVariant: 'bb',
      variants: [
        {
          finish: 'bb',
          label: 'BB',
          articleNumber: '1',
          url: 'u',
          assetId: 'a1',
          price: 204,
          glbMaterials: [],
        },
        {
          finish: 'white',
          label: 'White',
          articleNumber: '2',
          url: 'u',
          assetId: 'a2',
          price: 299,
          glbMaterials: [],
        },
      ],
    } as IkeaGltfDef
    // Default (no instance variant) → active variant price.
    expect(itemPrice(twoVariant, 'beds')).toBe(204)
    // Instance switched to the pricier finish → its price.
    expect(itemPrice(twoVariant, 'beds', 'white')).toBe(299)
  })

  it('falls back to the active variant when the instance variant has no price', () => {
    const mixed = {
      ...ikea,
      activeVariant: 'bb',
      variants: [
        {
          finish: 'bb',
          label: 'BB',
          articleNumber: '1',
          url: 'u',
          assetId: 'a1',
          price: 204,
          glbMaterials: [],
        },
        {
          finish: 'white',
          label: 'White',
          articleNumber: '2',
          url: 'u',
          assetId: 'a2',
          price: undefined,
          glbMaterials: [],
        },
      ],
    } as IkeaGltfDef
    expect(itemPrice(mixed, 'beds', 'white')).toBe(204)
  })

  it('a custom priceOverride (ITEM-META) wins over the IKEA variant price', () => {
    expect(itemPrice(ikea, 'beds', undefined, 500)).toBe(500)
  })

  it('a custom priceOverride wins over the category/table fallback', () => {
    const bed = { id: 'bed-queen', category: 'beds' } as FurnitureDef
    expect(itemPrice(bed, 'beds', undefined, 0)).toBe(0) // zero is a valid override
    expect(itemPrice(bed, 'beds', undefined, 42)).toBe(42)
  })

  it('ignores an invalid priceOverride (negative/NaN/undefined) and falls back normally', () => {
    const bed = { id: 'bed-queen', category: 'beds' } as FurnitureDef
    expect(itemPrice(bed, 'beds', undefined, -5)).toBe(900)
    expect(itemPrice(bed, 'beds', undefined, Number.NaN)).toBe(900)
    expect(itemPrice(bed, 'beds', undefined, undefined)).toBe(900)
  })
})

describe('furniturePrices', () => {
  it('returns explicit prices for notable items', () => {
    const sofa = { id: 'sofa-3seat', category: 'seating' } as FurnitureDef
    const fridge = { id: 'refrigerator', category: 'appliances' } as FurnitureDef
    expect(itemPrice(sofa, 'seating')).toBe(1200)
    expect(itemPrice(fridge, 'appliances')).toBe(1500)
  })

  it('falls back to a category price for unlisted items', () => {
    const decor = { id: 'some-unknown-decor', category: 'decor' } as FurnitureDef
    const bed = { id: 'some-unknown-bed', category: 'beds' } as FurnitureDef
    expect(itemPrice(decor, 'decor')).toBe(60)
    expect(itemPrice(bed, 'beds')).toBe(650)
  })

  it('every catalog item resolves to a positive price', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      expect(itemPrice(def, def.category)).toBeGreaterThan(0)
    }
  })

  it('every builtin item has an explicit price (no silent category fallback)', () => {
    const missing = Object.values(BUILTIN_CATALOG)
      .map((d) => d.id)
      .filter((id) => !(id in ITEM_PRICE))
    expect(missing).toEqual([])
  })

  it('the default move-in layout totals a sensible ballpark', () => {
    let total = 0
    for (const e of defaultLayout()) {
      const def = BUILTIN_CATALOG[e.defId]
      if (def) total += itemPrice(def, def.category)
    }
    // A furnished 4-room flat: a few thousand to low tens of thousands SGD.
    expect(total).toBeGreaterThan(3000)
    expect(total).toBeLessThan(60000)
  })
})
