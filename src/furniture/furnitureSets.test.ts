import { describe, it, expect } from 'vitest';
import { FURNITURE_SETS } from './furnitureSets';
import { BUILTIN_CATALOG } from './builtinCatalog';

describe('furniture sets', () => {
  it('have unique ids and at least two items each', () => {
    const ids = new Set(FURNITURE_SETS.map((s) => s.id));
    expect(ids.size).toBe(FURNITURE_SETS.length);
    for (const s of FURNITURE_SETS) expect(s.items.length).toBeGreaterThanOrEqual(2);
  });

  it('every set item references a known catalog def', () => {
    for (const s of FURNITURE_SETS) {
      for (const it of s.items) {
        expect(BUILTIN_CATALOG[it.defId], `${s.id}: ${it.defId}`).toBeDefined();
      }
    }
  });
});
