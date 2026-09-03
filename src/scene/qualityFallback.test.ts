import { describe, expect, it } from 'vitest'
import { seg } from '../furniture/primitives/useDetail'
import { DEVICE_CLASSES, presetFor, RENDER_TIERS, type RenderTier, resolveQuality } from './quality'

describe('resolveQuality', () => {
  it('resolves every mode/device pair to an increasing geometry detail', () => {
    // Same four values the retired four rungs produced, in the same order.
    const details = RENDER_TIERS.flatMap((t) =>
      DEVICE_CLASSES.map((d) => resolveQuality(t, undefined, d).geometryDetail),
    )
    expect(details).toEqual([0.7, 1, 1.4, 1.8])
    for (const d of details) expect(Number.isFinite(d)).toBe(true)
  })

  it('falls back to a real preset for a tier that is not in the table', () => {
    // A persisted tier from an older build must not produce an all-undefined
    // settings object: that yields NaN geometry segments and meshes that render
    // as nothing (a floor lamp keeps its pole and silently loses its shade).
    const rogue = resolveQuality('quality' as RenderTier, undefined)
    expect(rogue).toEqual(presetFor('performance', 'weak'))
    expect(Number.isFinite(rogue.geometryDetail)).toBe(true)
    expect(Number.isFinite(seg(28, rogue.geometryDetail))).toBe(true)
  })

  it('still lets overrides win over the fallback', () => {
    const r = resolveQuality('nope' as RenderTier, { geometryDetail: 1.25 })
    expect(r.geometryDetail).toBe(1.25)
  })

  it('never yields NaN segments for any tier, real or rogue', () => {
    // Includes the RETIRED tier names on purpose: they are still sitting in real
    // browsers' localStorage, so they must resolve to a real settings object.
    for (const t of ['performance', 'realistic', 'medium', 'high', 'maximum', 'quality', '']) {
      const d = resolveQuality(t as RenderTier, undefined).geometryDetail
      expect(Number.isNaN(seg(28, d))).toBe(false)
    }
  })
})
