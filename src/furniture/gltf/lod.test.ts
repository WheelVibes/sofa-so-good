import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lodSuffix, lodUrl, baseUrl, TIER_BUDGETS, resolveLodUrlSync, prewarmLod, __resetLodCacheForTest } from './lod';

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

describe('lod resolution', () => {
  beforeEach(() => __resetLodCacheForTest());

  it('returns base url on high regardless of cache', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'high')).toBe('/m/foo.glb');
  });

  it('returns base url before the variant is known to exist', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb');
  });

  it('returns the variant url after prewarm confirms it exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await prewarmLod('/m/foo.glb', 'low');
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo-low.glb');
    expect(fetchMock).toHaveBeenCalledWith('/m/foo-low.glb', { method: 'HEAD' });
    vi.unstubAllGlobals();
  });

  it('keeps base url and does not re-probe after a miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await prewarmLod('/m/foo.glb', 'low');
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb');
    await prewarmLod('/m/foo.glb', 'low'); // second call cached
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
