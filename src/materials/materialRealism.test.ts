import { describe, expect, it } from 'vitest'
import type { RenderTier } from '../scene/quality'
import {
  clearcoatLayer,
  glassConfig,
  glassSkyCatchIntensity,
  sheenLayer,
  transmissionTiers,
} from './materialRealism'

const ALL_TIERS: RenderTier[] = ['performance', 'medium', 'high', 'maximum']

describe('transmissionTiers', () => {
  it('gates real transmission to High + Maximum only', () => {
    expect(transmissionTiers('performance')).toBe(false)
    expect(transmissionTiers('medium')).toBe(false)
    expect(transmissionTiers('high')).toBe(true)
    expect(transmissionTiers('maximum')).toBe(true)
  })
})

describe('glassConfig', () => {
  it('never returns the expensive physical glass on Performance/Medium', () => {
    for (const tier of ['performance', 'medium'] as RenderTier[]) {
      const { physical, cheap } = glassConfig(tier, 0.3)
      expect(physical).toBeNull()
      expect(cheap).not.toBeNull()
      expect(cheap?.transparent).toBe(true)
      expect(cheap?.opacity).toBe(0.3)
    }
  })

  it('returns refractive physical glass on High/Maximum', () => {
    for (const tier of ['high', 'maximum'] as RenderTier[]) {
      const { physical, cheap } = glassConfig(tier, 0.3)
      expect(cheap).toBeNull()
      expect(physical).not.toBeNull()
      expect(physical?.ior).toBeCloseTo(1.5)
      expect(physical?.roughness).toBeLessThan(0.1)
      expect(physical?.transmission).toBeGreaterThan(0)
      expect(physical?.transmission).toBeLessThanOrEqual(0.98)
    }
  })

  it('maps a clearer pane (lower opacity) to higher transmission', () => {
    const clear = glassConfig('high', 0.1).physical
    const frosted = glassConfig('high', 0.6).physical
    expect(clear?.transmission ?? 0).toBeGreaterThan(frosted?.transmission ?? 1)
  })

  it('clamps transmission away from the degenerate ends', () => {
    const veryClear = glassConfig('high', 0).physical
    const veryFrosted = glassConfig('high', 1).physical
    expect(veryClear?.transmission).toBeLessThanOrEqual(0.98)
    expect(veryFrosted?.transmission).toBeGreaterThanOrEqual(0.55)
  })

  it('thickens the volume for tinted glass', () => {
    const clear = glassConfig('high', 0.3, 0).physical
    const tinted = glassConfig('high', 0.3, 1).physical
    expect(tinted?.thickness ?? 0).toBeGreaterThan(clear?.thickness ?? 0)
  })
})

describe('sheenLayer', () => {
  it('gives velvet the strongest, most coloured sheen', () => {
    const velvet = sheenLayer('velvet')
    const fabric = sheenLayer('fabric')
    expect(velvet).not.toBeNull()
    expect(fabric).not.toBeNull()
    expect(velvet!.sheen).toBeGreaterThan(fabric!.sheen)
    expect(velvet!.sheenColorLift).toBeGreaterThan(fabric!.sheenColorLift)
  })

  it('gives leather a faint sheen', () => {
    const leather = sheenLayer('leather')
    expect(leather).not.toBeNull()
    expect(leather!.sheen).toBeGreaterThan(0)
    expect(leather!.sheen).toBeLessThan(1)
  })

  it('returns null for finishes that should stay matte', () => {
    expect(sheenLayer('wood')).toBeNull()
    expect(sheenLayer('painted')).toBeNull()
    expect(sheenLayer('concrete')).toBeNull()
    expect(sheenLayer('unknown')).toBeNull()
  })

  it('keeps every sheen value in a physical [0,1] range', () => {
    for (const kind of ['velvet', 'fabric', 'leather']) {
      const l = sheenLayer(kind)!
      expect(l.sheen).toBeGreaterThanOrEqual(0)
      expect(l.sheen).toBeLessThanOrEqual(1)
      expect(l.sheenRoughness).toBeGreaterThanOrEqual(0)
      expect(l.sheenRoughness).toBeLessThanOrEqual(1)
      expect(l.sheenColorLift).toBeGreaterThanOrEqual(0)
      expect(l.sheenColorLift).toBeLessThanOrEqual(1)
    }
  })
})

describe('clearcoatLayer', () => {
  it('coats lacquered gloss, ceramic, and polished stone', () => {
    expect(clearcoatLayer('gloss')?.clearcoat).toBeGreaterThan(0)
    expect(clearcoatLayer('ceramic')?.clearcoat).toBeGreaterThan(0)
    expect(clearcoatLayer('marble')?.clearcoat).toBeGreaterThan(0)
    expect(clearcoatLayer('stone')?.clearcoat).toBeGreaterThan(0)
  })

  it('gives ceramic the glossiest (smoothest) coat', () => {
    const ceramic = clearcoatLayer('ceramic')!
    const stone = clearcoatLayer('stone')!
    expect(ceramic.clearcoatRoughness).toBeLessThan(stone.clearcoatRoughness)
  })

  it('leaves matte finishes uncoated', () => {
    expect(clearcoatLayer('painted')).toBeNull()
    expect(clearcoatLayer('wood')).toBeNull()
    expect(clearcoatLayer('concrete')).toBeNull()
    expect(clearcoatLayer('rattan')).toBeNull()
  })

  it('keeps every clearcoat value in a physical [0,1] range', () => {
    for (const kind of ['gloss', 'ceramic', 'marble', 'stone']) {
      const l = clearcoatLayer(kind)!
      expect(l.clearcoat).toBeGreaterThanOrEqual(0)
      expect(l.clearcoat).toBeLessThanOrEqual(1)
      expect(l.clearcoatRoughness).toBeGreaterThanOrEqual(0)
      expect(l.clearcoatRoughness).toBeLessThanOrEqual(1)
    }
  })
})

describe('tier coverage', () => {
  it('resolves glass for every render tier without throwing', () => {
    for (const tier of ALL_TIERS) {
      expect(() => glassConfig(tier)).not.toThrow()
    }
  })
})

describe('glassSkyCatchIntensity (RZ2)', () => {
  it('is bright by day and dark at night', () => {
    expect(glassSkyCatchIntensity(1)).toBeGreaterThan(0.3)
    expect(glassSkyCatchIntensity(0)).toBe(0)
  })

  it('ramps monotonically and clamps out-of-range daylight', () => {
    expect(glassSkyCatchIntensity(0.5)).toBeGreaterThan(glassSkyCatchIntensity(0.2))
    expect(glassSkyCatchIntensity(2)).toBe(glassSkyCatchIntensity(1))
    expect(glassSkyCatchIntensity(-1)).toBe(0)
  })

  it('stays below the bloom threshold so windows do not bloom', () => {
    expect(glassSkyCatchIntensity(1)).toBeLessThan(1.05)
  })
})
