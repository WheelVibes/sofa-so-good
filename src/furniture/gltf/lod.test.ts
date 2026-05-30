import { describe, it, expect } from 'vitest';
import { lodSuffix, lodUrl, baseUrl, TIER_BUDGETS } from './lod';

describe('lod url helpers', () => {
  it('maps tiers to suffixes', () => {
    expect(lodSuffix('high')).toBe('');
    expect(lodSuffix('low')).toBe('-low');
    expect(lodSuffix('medium')).toBe('-medium');
  });

  it('builds variant urls preserving the .glb extension', () => {
    expect(lodUrl('/models/foo.glb', 'high')).toBe('/models/foo.glb');
    expect(lodUrl('/models/foo.glb', 'low')).toBe('/models/foo-low.glb');
    expect(lodUrl('/models/foo.glb', 'medium')).toBe('/models/foo-medium.glb');
  });

  it('handles urls with query strings', () => {
    expect(lodUrl('/m/foo.glb?v=2', 'low')).toBe('/m/foo-low.glb?v=2');
  });

  it('strips a tier suffix back to the base url', () => {
    expect(baseUrl('/models/foo-low.glb')).toBe('/models/foo.glb');
    expect(baseUrl('/models/foo-medium.glb')).toBe('/models/foo.glb');
    expect(baseUrl('/models/foo.glb')).toBe('/models/foo.glb');
  });

  it('exposes texture + geometry budgets per tier', () => {
    expect(TIER_BUDGETS.low.maxTexture).toBe(512);
    expect(TIER_BUDGETS.low.triangleRatio).toBe(0.5);
    expect(TIER_BUDGETS.medium.maxTexture).toBe(1024);
    expect(TIER_BUDGETS.medium.triangleRatio).toBe(0.75);
  });
});
