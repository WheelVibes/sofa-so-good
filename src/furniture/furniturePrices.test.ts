import { describe, it, expect } from 'vitest';
import { itemPrice } from './furniturePrices';
import { BUILTIN_CATALOG } from './builtinCatalog';
import { defaultLayout } from './defaultLayout';

describe('furniturePrices', () => {
  it('returns explicit prices for notable items', () => {
    expect(itemPrice('sofa-3seat', 'seating')).toBe(1200);
    expect(itemPrice('refrigerator', 'appliances')).toBe(1500);
  });

  it('falls back to a category price for unlisted items', () => {
    expect(itemPrice('some-unknown-decor', 'decor')).toBe(60);
    expect(itemPrice('some-unknown-bed', 'beds')).toBe(650);
  });

  it('every catalog item resolves to a positive price', () => {
    for (const def of Object.values(BUILTIN_CATALOG)) {
      expect(itemPrice(def.id, def.category)).toBeGreaterThan(0);
    }
  });

  it('the default move-in layout totals a sensible ballpark', () => {
    let total = 0;
    for (const e of defaultLayout()) {
      const def = BUILTIN_CATALOG[e.defId];
      if (def) total += itemPrice(def.id, def.category);
    }
    // A furnished 4-room flat: a few thousand to low tens of thousands SGD.
    expect(total).toBeGreaterThan(3000);
    expect(total).toBeLessThan(60000);
  });
});
