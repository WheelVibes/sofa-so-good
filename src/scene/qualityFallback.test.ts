import { describe, expect, it } from 'vitest'
import { seg } from '../furniture/primitives/useDetail'
import { QUALITY_PRESETS, type RenderTier, resolveQuality } from './quality'

describe('resolveQuality', () => {
  it('resolves every real tier to an increasing geometry detail', () => {
    const tiers: RenderTier[] = ['performance', 'medium', 'high', 'maximum']
    const details = tiers.map((t) => resolveQuality(t, undefined).geometryDetail)
    expect(details).toEqual([0.7, 1, 1.4, 1.8])
    for (const d of details) expect(Number.isFinite(d)).toBe(true)
  })

  it('falls back to a real preset for a tier that is not in the table', () => {
    // A persisted tier from an older build must not produce an all-undefined
    // settings object: that yields NaN geometry segments and meshes that render
    // as nothing (a floor lamp keeps its pole and silently loses its shade).
    const rogue = resolveQuality('quality' as RenderTier, undefined)
    expect(rogue).toEqual(QUALITY_PRESETS.performance)
    expect(Number.isFinite(rogue.geometryDetail)).toBe(true)
    expect(Number.isFinite(seg(28, rogue.geometryDetail))).toBe(true)
  })

  it('still lets overrides win over the fallback', () => {
    const r = resolveQuality('nope' as RenderTier, { geometryDetail: 1.25 })
    expect(r.geometryDetail).toBe(1.25)
  })

  it('never yields NaN segments for any tier, real or rogue', () => {
    for (const t of ['performance', 'medium', 'high', 'maximum', 'quality', '']) {
      const d = resolveQuality(t as RenderTier, undefined).geometryDetail
      expect(Number.isNaN(seg(28, d))).toBe(false)
    }
  })
})
