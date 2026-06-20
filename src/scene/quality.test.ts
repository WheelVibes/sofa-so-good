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

  it('every tier — including the flat performance tier — grounds furniture with contact shadows (RZ1)', () => {
    for (const t of RENDER_TIERS) expect(QUALITY_PRESETS[t].contactShadows).toBe(true)
  })

  it('baked corner AO is on for the post-AO-less tiers and off where the post stack runs (RD-403)', () => {
    expect(QUALITY_PRESETS.performance.cornerAo).toBe(true)
    expect(QUALITY_PRESETS.medium.cornerAo).toBe(true)
    expect(QUALITY_PRESETS.high.cornerAo).toBe(false)
    expect(QUALITY_PRESETS.maximum.cornerAo).toBe(false)
    // The baked strip must never run alongside real SSAO (double-darkening).
    for (const t of RENDER_TIERS) {
      if (QUALITY_PRESETS[t].postprocessing) expect(QUALITY_PRESETS[t].cornerAo).toBe(false)
    }
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

  it('only the top (maximum) tier enables the cinematic finish + full-res AO', () => {
    expect(QUALITY_PRESETS.maximum.cinematic).toBe(true)
    expect(QUALITY_PRESETS.maximum.aoFullRes).toBe(true)
    for (const t of ['performance', 'medium', 'high'] as const) {
      expect(QUALITY_PRESETS[t].cinematic).toBe(false)
      expect(QUALITY_PRESETS[t].aoFullRes).toBe(false)
    }
  })

  it('IBL probe resolution is monotonically non-decreasing across the tier order', () => {
    const res = RENDER_TIERS.map((t) => QUALITY_PRESETS[t].envResolution)
    for (let i = 1; i < res.length; i++) expect(res[i]).toBeGreaterThanOrEqual(res[i - 1]!)
  })

  it('cinematic/full-res AO only ever apply where the post stack runs', () => {
    // aoFullRes + cinematic are no-ops without `postprocessing`; the presets must
    // never enable them on a tier that has the post stack off.
    for (const t of RENDER_TIERS) {
      const p = QUALITY_PRESETS[t]
      if (p.cinematic || p.aoFullRes) expect(p.postprocessing).toBe(true)
    }
  })

  it('raster DoF is on only for high/maximum (and only where the post stack runs)', () => {
    // PC2-CAM-DOF-LENS: DoF rides the post stack, so it must be off on the flat
    // tiers and on (available) only on high+.
    expect(QUALITY_PRESETS.high.dof).toBe(true)
    expect(QUALITY_PRESETS.maximum.dof).toBe(true)
    expect(QUALITY_PRESETS.performance.dof).toBe(false)
    expect(QUALITY_PRESETS.medium.dof).toBe(false)
    for (const t of RENDER_TIERS) {
      if (QUALITY_PRESETS[t].dof) expect(QUALITY_PRESETS[t].postprocessing).toBe(true)
    }
  })
})
