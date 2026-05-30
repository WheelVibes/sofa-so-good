import { describe, it, expect } from 'vitest';
import { itemPrice } from './furniturePrices';
import { BUILTIN_CATALOG } from './builtinCatalog';
import { defaultLayout } from './defaultLayout';
import type { FurnitureDef, IkeaGltfDef } from './types';

const ikea: IkeaGltfDef = {
  id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea', groupKey: 'malm',
  activeVariant: 'bb',
  variants: [{ finish: 'bb', label: 'BB', articleNumber: '1', url: 'u', assetId: 'a1', price: 204, glbMaterials: [] }],
  defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
};

describe('itemPrice', () => {
  it('uses the IKEA active-variant price', () => {
    expect(itemPrice(ikea, 'beds')).toBe(204);
  });

  it('falls back to per-item then category for non-IKEA', () => {
    const bed = { id: 'bed-queen', category: 'beds' } as FurnitureDef;
    expect(itemPrice(bed, 'beds')).toBe(900); // ITEM_PRICE['bed-queen']
    const unknown = { id: 'nope', category: 'tables' } as FurnitureDef;
    expect(itemPrice(unknown, 'tables')).toBe(240); // CATEGORY_BASE.tables
  });

  it('falls back to category when an IKEA active variant has no price', () => {
    const noPrice = { ...ikea, variants: [{ ...ikea.variants[0], price: undefined }] } as IkeaGltfDef;
    expect(itemPrice(noPrice, 'beds')).toBe(650); // CATEGORY_BASE.beds
  });
});

describe('furniturePrices', () => {
  it('returns explicit prices for notable items', () => {
    const sofa = { id: 'sofa-3seat', category: 'seating' } as FurnitureDef;
    const fridge = { id: 'refrigerator', category: 'appliances' } as FurnitureDef;
    expect(itemPrice(sofa, 'seating')).toBe(1200);
    expect(itemPrice(fridge, 'appliances')).toBe(1500);
  });

  it('falls back to a category price for unlisted items', () => {
    const decor = { id: 'some-unknown-decor', category: 'decor' } as FurnitureDef;
    const bed = { id: 'some-unknown-bed', category: 'beds' } as FurnitureDef;
    expect(itemPrice(decor, 'decor')).toBe(60);
    expect(itemPrice(bed, 'beds')).toBe(650);
  });

  it('every catalog item resolves to a positive price', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      expect(itemPrice(def, def.category)).toBeGreaterThan(0);
    }
  });

  it('the default move-in layout totals a sensible ballpark', () => {
    let total = 0;
    for (const e of defaultLayout()) {
      const def = BUILTIN_CATALOG[e.defId];
      if (def) total += itemPrice(def, def.category);
    }
    // A furnished 4-room flat: a few thousand to low tens of thousands SGD.
    expect(total).toBeGreaterThan(3000);
    expect(total).toBeLessThan(60000);
  });
});
