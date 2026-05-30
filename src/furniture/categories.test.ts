import { describe, it, expect } from 'vitest';
import { FURNITURE_CATEGORIES } from './types';

describe('FurnitureCategory', () => {
  it('includes the IKEA-department categories', () => {
    for (const c of [
      'beds', 'seating', 'tables', 'storage', 'kitchen', 'bathroom',
      'appliances', 'lighting', 'decor', 'textiles', 'outdoor',
      'electronics', 'kids', 'laundry', 'others',
    ] as const) {
      expect(FURNITURE_CATEGORIES).toContain(c);
    }
  });
  it('has 15 categories', () => {
    expect(FURNITURE_CATEGORIES).toHaveLength(15);
  });
  it('lists others last (catch-all sorts to the end)', () => {
    expect(FURNITURE_CATEGORIES[FURNITURE_CATEGORIES.length - 1]).toBe('others');
  });
});
