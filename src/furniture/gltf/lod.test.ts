import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetLodCacheForTest,
  baseUrl,
  lodAssetId,
  lodSuffix,
  lodUrl,
  parseLodAssetId,
  prewarmLod,
  registerLodVariants,
  resolveLodUrlSync,
  TIER_BUDGETS,
  unregisterLodVariants,
} from './lod'

describe('lod url helpers', () => {
  it('maps tiers to suffixes', () => {
    expect(lodSuffix('high')).toBe('')
    expect(lodSuffix('low')).toBe('-low')
    expect(lodSuffix('medium')).toBe('-medium')
  })

  it('builds variant urls preserving the .glb extension', () => {
    expect(lodUrl('/models/foo.glb', 'high')).toBe('/models/foo.glb')
    expect(lodUrl('/models/foo.glb', 'low')).toBe('/models/foo-low.glb')
    expect(lodUrl('/models/foo.glb', 'medium')).toBe('/models/foo-medium.glb')
  })

  it('handles urls with query strings', () => {
    expect(lodUrl('/m/foo.glb?v=2', 'low')).toBe('/m/foo-low.glb?v=2')
  })

  it('strips a tier suffix back to the base url', () => {
    expect(baseUrl('/models/foo-low.glb')).toBe('/models/foo.glb')
    expect(baseUrl('/models/foo-medium.glb')).toBe('/models/foo.glb')
    expect(baseUrl('/models/foo.glb')).toBe('/models/foo.glb')
  })

  it('exposes texture + geometry budgets per tier', () => {
    expect(TIER_BUDGETS.low.maxTexture).toBe(512)
    expect(TIER_BUDGETS.low.triangleRatio).toBe(0.5)
    expect(TIER_BUDGETS.medium.maxTexture).toBe(1024)
    expect(TIER_BUDGETS.medium.triangleRatio).toBe(0.75)
  })
})

describe('lod resolution', () => {
  beforeEach(() => __resetLodCacheForTest())

  it('returns base url on high regardless of cache', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'high')).toBe('/m/foo.glb')
  })

  it('returns base url before the variant is known to exist', () => {
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb')
  })

  it('returns the variant url after prewarm confirms it exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response)
    vi.stubGlobal('fetch', fetchMock)
    await prewarmLod('/m/foo.glb', 'low')
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo-low.glb')
    expect(fetchMock).toHaveBeenCalledWith('/m/foo-low.glb', { method: 'HEAD' })
    vi.unstubAllGlobals()
  })

  it('keeps base url and does not re-probe after a miss', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response)
    vi.stubGlobal('fetch', fetchMock)
    await prewarmLod('/m/foo.glb', 'low')
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('/m/foo.glb')
    await prewarmLod('/m/foo.glb', 'low') // second call cached
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})

describe('lod asset-id derivation (upload IDB siblings)', () => {
  it('derives deterministic tier keys from a base asset id', () => {
    expect(lodAssetId('abc-123', 'low')).toBe('abc-123:lod-low')
    expect(lodAssetId('abc-123', 'medium')).toBe('abc-123:lod-medium')
  })

  it('parses derived keys back to base + tier, and rejects regular ids', () => {
    expect(parseLodAssetId('abc-123:lod-low')).toEqual({ baseAssetId: 'abc-123', tier: 'low' })
    expect(parseLodAssetId('abc-123:lod-medium')).toEqual({
      baseAssetId: 'abc-123',
      tier: 'medium',
    })
    expect(parseLodAssetId('abc-123')).toBeNull()
    expect(parseLodAssetId('abc-123:lod-high')).toBeNull()
  })

  it('round-trips for both tiers', () => {
    for (const tier of ['low', 'medium'] as const) {
      expect(parseLodAssetId(lodAssetId('id', tier))).toEqual({ baseAssetId: 'id', tier })
    }
  })
})

describe('registered (upload blob-url) variants', () => {
  beforeEach(() => __resetLodCacheForTest())

  it('resolves registered variants without probing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    registerLodVariants('blob:base', { low: 'blob:low', medium: 'blob:med' })
    expect(resolveLodUrlSync('blob:base', 'low')).toBe('blob:low')
    expect(resolveLodUrlSync('blob:base', 'medium')).toBe('blob:med')
    expect(resolveLodUrlSync('blob:base', 'high')).toBe('blob:base')
    await prewarmLod('blob:base', 'low') // registered ⇒ no HEAD probe
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('falls back to the base url for a tier that was not generated', () => {
    registerLodVariants('blob:base', { medium: 'blob:med' })
    expect(resolveLodUrlSync('blob:base', 'low')).toBe('blob:base')
    expect(resolveLodUrlSync('blob:base', 'medium')).toBe('blob:med')
  })

  it('maps a registered variant url back to its base (footprint cache key)', () => {
    registerLodVariants('blob:base', { low: 'blob:low' })
    expect(baseUrl('blob:low')).toBe('blob:base')
    expect(baseUrl('blob:base')).toBe('blob:base')
  })

  it('unregister returns the variant urls and stops resolution', () => {
    registerLodVariants('blob:base', { low: 'blob:low', medium: 'blob:med' })
    const removed = unregisterLodVariants('blob:base')
    expect(removed.sort()).toEqual(['blob:low', 'blob:med'])
    expect(resolveLodUrlSync('blob:base', 'low')).toBe('blob:base')
    expect(baseUrl('blob:low')).toBe('blob:low')
    expect(unregisterLodVariants('blob:base')).toEqual([])
  })

  it('registered variants take priority over suffix probing for .glb urls', () => {
    registerLodVariants('/m/foo.glb', { low: 'blob:override' })
    expect(resolveLodUrlSync('/m/foo.glb', 'low')).toBe('blob:override')
  })
})
