import { describe, it, expect } from 'vitest';
import { BUILTIN_CATALOG } from './builtinCatalog';

/** Mirrors the catalog-drawer search predicate (name OR keyword match). */
function search(query: string) {
  const q = query.trim().toLowerCase();
  return Object.values(BUILTIN_CATALOG).filter(
    (d) => d.name.toLowerCase().includes(q) || d.keywords?.some((k) => k.toLowerCase().includes(q)),
  );
}

describe('catalog keyword search', () => {
  it.each([
    ['credenza', 'sideboard'],
    ['cot', 'crib'],
    ['pouf', 'ottoman'],
    ['couch', 'sofa-3seat'],
    ['fridge', 'refrigerator'],
    ['closet', 'wardrobe-3door'],
    ['screen', 'room-divider'],
    ['trolley', 'bar-cart'],
  ])('finds %s → %s via a synonym', (query, expectedId) => {
    expect(search(query).map((d) => d.id)).toContain(expectedId);
  });

  it('still matches by display name', () => {
    expect(search('sideboard').map((d) => d.id)).toContain('sideboard');
  });
});
