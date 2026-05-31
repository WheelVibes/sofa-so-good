import { describe, it, expect } from 'vitest';
import { effectiveAssetTier } from './quality';

describe('effectiveAssetTier', () => {
  it('tracks the render tier when asset tier is Auto (null)', () => {
    expect(effectiveAssetTier(null, 'low')).toBe('low');
    expect(effectiveAssetTier(null, 'medium')).toBe('medium');
    expect(effectiveAssetTier(null, 'high')).toBe('high');
  });

  it('ignores the render tier when an asset tier is explicitly set', () => {
    expect(effectiveAssetTier('high', 'low')).toBe('high');
    expect(effectiveAssetTier('low', 'high')).toBe('low');
  });
});
