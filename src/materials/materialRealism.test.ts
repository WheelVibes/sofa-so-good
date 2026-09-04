import { describe, expect, it } from 'vitest'
import type { RenderTier } from '../scene/quality'
import {
  clearcoatLayer,
  glassConfig,
  glassSkyCatchIntensity,
  sheenLayer,
  transmissionResolutionScaleForTier,
  transmissionTiers,
  windowGlassPhysical,
  windowTransmission,
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

  it('gives cheap glass a fresnel rim + faint sky reflection (RD-405)', () => {
    for (const tier of ['performance', 'medium'] as RenderTier[]) {
      const { cheap } = glassConfig(tier, 0.3)
      expect(cheap?.ior).toBeCloseTo(1.5)
      expect(cheap?.envMapIntensity).toBeGreaterThan(0)
      // Faint, not a mirror — stays well below the glossy/physical reflection cap.
      expect(cheap?.envMapIntensity).toBeLessThan(1)
      expect(cheap?.roughness).toBeLessThan(0.1)
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

  // GLASS-SKYCATCH-VEIL (v0.31.8.50). The sky-catch is a STAND-IN for sky
  // luminance where nothing is painted behind the pane. When a backdrop IS
  // painted it double-counts — a constant emissive on every pane pixel, which
  // raises the floor uniformly and flattens whatever the view carries. Measured
  // at the default flat's living-room window, 13:00, `medium`: dropping it took
  // pane spread (p95−p05) 47 → 63 on the `sky` backdrop and 31 → 38 on `city`.
  it('retires entirely when a backdrop paints a real view behind the pane', () => {
    expect(glassSkyCatchIntensity(1, true)).toBe(0)
    expect(glassSkyCatchIntensity(0.5, true)).toBe(0)
  })

  it('defaults to the RZ2 behaviour, so every backdrop-less path is unchanged', () => {
    // Orbit / dollhouse and the `none` backdrop are exactly the case RZ2 added
    // it for. The default argument keeps them byte-identical.
    expect(glassSkyCatchIntensity(1, false)).toBe(glassSkyCatchIntensity(1))
    expect(glassSkyCatchIntensity(0.37, false)).toBe(glassSkyCatchIntensity(0.37))
  })

  it('cannot regress the 21:00 case (l) records as already correct', () => {
    // At night `daylight` → 0 and the sky-catch is already 0, so the backdrop
    // argument has nothing left to remove. This is the guard (l) asks for.
    expect(glassSkyCatchIntensity(0, true)).toBe(glassSkyCatchIntensity(0, false))
    expect(glassSkyCatchIntensity(0, true)).toBe(0)
  })
})

describe('windowGlassPhysical (PHOTO-GLASS)', () => {
  it('is null on Performance/Medium so cheap panes stay byte-identical', () => {
    expect(windowGlassPhysical('performance')).toBeNull()
    expect(windowGlassPhysical('medium')).toBeNull()
  })

  it('returns architectural-glass params on High/Maximum', () => {
    for (const tier of ['high', 'maximum'] as const) {
      const p = windowGlassPhysical(tier)
      expect(p).not.toBeNull()
      expect(p?.ior).toBe(1.5)
      expect(p?.thickness).toBeGreaterThan(0)
      expect(p?.metalness).toBe(0)
      expect(p?.roughness).toBeLessThan(0.2)
      expect(p?.attenuationDistance).toBeGreaterThan(0)
    }
  })

  it('matches the glassware transmission gate exactly (one tier story)', () => {
    for (const tier of ALL_TIERS) {
      expect(windowGlassPhysical(tier) !== null).toBe(transmissionTiers(tier))
    }
  })
})

describe('windowTransmission (day/night blend)', () => {
  it('is nearly clear by day and a dark reflective pane at night', () => {
    expect(windowTransmission(1)).toBeGreaterThan(0.85)
    expect(windowTransmission(0)).toBeLessThanOrEqual(0.25)
  })

  it('is monotonic in daylight and clamped outside [0,1]', () => {
    expect(windowTransmission(0.5)).toBeGreaterThan(windowTransmission(0.1))
    expect(windowTransmission(2)).toBe(windowTransmission(1))
    expect(windowTransmission(-1)).toBe(windowTransmission(0))
  })

  it('never reaches degenerate 0/1 transmission', () => {
    expect(windowTransmission(0)).toBeGreaterThan(0)
    expect(windowTransmission(1)).toBeLessThan(1)
  })
})

describe('transmissionResolutionScaleForTier', () => {
  it('bounds the transmissive pass at 75% on High, full res elsewhere', () => {
    expect(transmissionResolutionScaleForTier('high')).toBe(0.75)
    expect(transmissionResolutionScaleForTier('maximum')).toBe(1)
    // Inert (no transmission pass) on the cheap tiers — keep neutral 1.
    expect(transmissionResolutionScaleForTier('performance')).toBe(1)
    expect(transmissionResolutionScaleForTier('medium')).toBe(1)
  })
})
