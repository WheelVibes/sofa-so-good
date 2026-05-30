import { describe, it, expect } from 'vitest';
import { FURNITURE_CATEGORIES } from './types';

describe('FurnitureCategory', () => {
  it('includes textiles and outdoor', () => {
    expect(FURNITURE_CATEGORIES).toContain('textiles');
    expect(FURNITURE_CATEGORIES).toContain('outdoor');
  });
  it('has 11 categories', () => {
    expect(FURNITURE_CATEGORIES).toHaveLength(11);
  });
});
