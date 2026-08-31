import { describe, expect, it } from 'vitest'
import {
  effectiveAssetTier,
  QUALITY_PRESETS,
  type QualitySettings,
  RENDER_TIERS,
  renderToAssetTier,
  resolveQuality,
} from './quality'

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

describe('resolveQuality — undefined override values (QUALITY-OVERRIDE-UNDEF)', () => {
  it('falls back to the preset instead of spreading undefined', () => {
    // `Partial<QualitySettings>` makes this type-legal, and a naive spread
    // overwrites the preset with `undefined`. That is not a revert, it is a
    // silent DISABLE: `castShadow={shadowMapSize > 0}` becomes `undefined > 0`
    // = false, and `postprocessing: undefined` is falsy so the composer (and
    // with it all tone mapping) never mounts.
    const preset = QUALITY_PRESETS.maximum
    const r = resolveQuality('maximum', {
      shadowMapSize: undefined,
      postprocessing: undefined,
    } as Partial<QualitySettings>)
    expect(r.shadowMapSize).toBe(preset.shadowMapSize)
    expect(r.postprocessing).toBe(preset.postprocessing)
  })

  it('still applies real override values', () => {
    expect(resolveQuality('maximum', { shadowMapSize: 1024 }).shadowMapSize).toBe(1024)
    expect(resolveQuality('maximum', { postprocessing: false }).postprocessing).toBe(false)
  })

  it('keeps falsy-but-defined overrides, which are meaningful', () => {
    // 0 and false are legitimate values — only `undefined` is the sentinel.
    expect(resolveQuality('maximum', { shadowMapSize: 0 }).shadowMapSize).toBe(0)
    expect(resolveQuality('maximum', { ibl: false }).ibl).toBe(false)
  })

  it('ignores an all-undefined override map entirely', () => {
    const r = resolveQuality('high', {
      shadowMapSize: undefined,
      ibl: undefined,
      dof: undefined,
    } as Partial<QualitySettings>)
    expect(r).toEqual(QUALITY_PRESETS.high)
  })
})

describe('the ao tier flag (TIER-AO)', () => {
  it('gives medium ambient occlusion without the full post stack', () => {
    // Medium is the tier the adaptive ladder auto-selects for most browsers, and
    // AO is the only pass that shapes non-directional fill — which is what
    // interiors here are lit by. Measured: 2.2ms for a meanAbsDiff of 12.94, the
    // best value-per-millisecond of any feature in the stack.
    expect(QUALITY_PRESETS.medium.ao).toBe(true)
    expect(QUALITY_PRESETS.medium.postprocessing).toBe(false)
  })

  it('keeps the flat tier flat', () => {
    // Performance's grounding cue is the cheap ContactShadow decal, not a composer.
    expect(QUALITY_PRESETS.performance.ao).toBe(false)
    expect(QUALITY_PRESETS.performance.postprocessing).toBe(false)
  })

  it('is implied by the full post stack', () => {
    // The full stack always contains N8AO, so a tier with postprocessing must
    // report ao too or callers would have to special-case it.
    for (const tier of RENDER_TIERS) {
      const p = QUALITY_PRESETS[tier]
      if (p.postprocessing) expect(p.ao).toBe(true)
    }
  })

  it('never has aoFullRes without ao', () => {
    for (const tier of RENDER_TIERS) {
      const p = QUALITY_PRESETS[tier]
      if (p.aoFullRes) expect(p.ao).toBe(true)
    }
  })
})
