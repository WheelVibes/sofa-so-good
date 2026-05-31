import { describe, expect, it } from 'vitest'
import { effectiveAssetTier, QUALITY_PRESETS, RENDER_TIERS, renderToAssetTier } from './quality'

describe('renderToAssetTier', () => {
  it('maps each render tier to the right asset-LOD tier', () => {
    expect(renderToAssetTier('performance')).toBe('low')
    expect(renderToAssetTier('medium')).toBe('medium')
    expect(renderToAssetTier('high')).toBe('high')
    expect(renderToAssetTier('maximum')).toBe('high')
  })
})

describe('effectiveAssetTier', () => {
  it('follows the render tier (via the asset mapping) when asset tier is Auto (null)', () => {
    expect(effectiveAssetTier(null, 'performance')).toBe('low')
    expect(effectiveAssetTier(null, 'medium')).toBe('medium')
    expect(effectiveAssetTier(null, 'high')).toBe('high')
    expect(effectiveAssetTier(null, 'maximum')).toBe('high')
  })

  it('ignores the render tier when an asset tier is explicitly set', () => {
    expect(effectiveAssetTier('high', 'performance')).toBe('high')
    expect(effectiveAssetTier('low', 'high')).toBe('low')
  })
})

describe('quality presets', () => {
  it('the performance tier is flat — no shadows, IBL, or post-processing', () => {
    const p = QUALITY_PRESETS.performance
    expect(p.shadowMapSize).toBe(0)
    expect(p.ibl).toBe(false)
    expect(p.postprocessing).toBe(false)
  })

  it('shadow resolution is monotonically non-decreasing across the tier order', () => {
    const sizes = RENDER_TIERS.map((t) => QUALITY_PRESETS[t].shadowMapSize)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
    }
  })

  it('has a preset for every render tier', () => {
    for (const t of RENDER_TIERS) expect(QUALITY_PRESETS[t]).toBeDefined()
  })
})
