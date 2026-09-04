import { describe, expect, it } from 'vitest'
import type { RenderTier } from '../scene/quality'
import {
  clearcoatLayer,
  glassConfig,
  glassSkyCatchIntensity,
  grilleGlareIntensity,
  sheenLayer,
  transmissionResolutionScaleForTier,
  transmissionTiers,
  windowGlassPhysical,
  windowTransmission,
} from './materialRealism'

const ALL_TIERS: RenderTier[] = ['performance', 'realistic']

describe('transmissionTiers', () => {
  it('gates real transmission to High + Maximum only', () => {
    expect(transmissionTiers('performance')).toBe(false)
    expect(transmissionTiers('performance')).toBe(false)
    expect(transmissionTiers('realistic')).toBe(true)
    expect(transmissionTiers('realistic')).toBe(true)
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

  it('returns refractive physical glass in realistic', () => {
    for (const tier of ['realistic'] as RenderTier[]) {
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
    const clear = glassConfig('realistic', 0.1).physical
    const frosted = glassConfig('realistic', 0.6).physical
    expect(clear?.transmission ?? 0).toBeGreaterThan(frosted?.transmission ?? 1)
  })

  it('clamps transmission away from the degenerate ends', () => {
    const veryClear = glassConfig('realistic', 0).physical
    const veryFrosted = glassConfig('realistic', 1).physical
    expect(veryClear?.transmission).toBeLessThanOrEqual(0.98)
    expect(veryFrosted?.transmission).toBeGreaterThanOrEqual(0.55)
  })

  it('thickens the volume for tinted glass', () => {
    const clear = glassConfig('realistic', 0.3, 0).physical
    const tinted = glassConfig('realistic', 0.3, 1).physical
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

describe('grilleGlareIntensity (item (l))', () => {
  it('NIGHT CANNOT REGRESS — exactly zero, by construction rather than by guard', () => {
    // `(l)`'s standing constraint. Cubed, so there is nothing for a coefficient to scale at
    // daylight 0: a grille that glowed at night would be a worse artefact than the dark bars this
    // replaces. `daylightFromAltitude` reaches 0 at a sun 8 deg below the horizon.
    expect(grilleGlareIntensity(0)).toBe(0)
    expect(grilleGlareIntensity(-1)).toBe(0)
  })

  it('lifts the bars by day and clamps out-of-range daylight', () => {
    expect(grilleGlareIntensity(1)).toBeGreaterThan(1)
    expect(grilleGlareIntensity(2)).toBe(grilleGlareIntensity(1))
  })

  it('stays negligible through the twilight band where bloom overlaps', () => {
    // `v0.31.7.156` measured a bright pane plus dusk bloom spilling onto wall and ceiling. The
    // cube is what keeps this term out of that band: `daylightFromAltitude` only ramps between
    // -8 deg and 0 deg, so half-twilight is daylight 0.5, and 0.5^3 is an eighth of the day value.
    expect(grilleGlareIntensity(0.5)).toBeLessThan(grilleGlareIntensity(1) / 7)
  })

  it('keeps the bars DARKER than the glass, which is what the reference does', () => {
    // Calibrated on p05 (the bars), not on the region mean: at the reference pose Cycles reads
    // p05 187 against p95 254, and the app now reads 187 against 243. An earlier calibration hit
    // the MEAN target and drove p05 to 213, which inverted the polarity -- bars brighter than
    // glass -- and the frame showed it as light streaks. So this pins the ordering the fix exists
    // to reproduce, not just a magnitude.
    expect(grilleGlareIntensity(1)).toBeLessThan(glassSkyCatchIntensity(1))
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

  it('stays below the bloom threshold WHERE BLOOM IS STRONG (item (l), reformulated)', () => {
    // This assertion used to read `glassSkyCatchIntensity(1) < 1.05`, and it blocked `(l)`'s fix.
    // `v0.31.7.156` dated both sides: the guard landed 2026-06-13, the bloom DAY-RAMP
    // (`BLOOM.intensity * (1 - d)`) landed 2026-06-27. When the guard was written bloom was active
    // in daylight, so testing at `d = 1` was the right place. After the ramp, `d = 1` is exactly
    // where bloom is OFF — so the old form guarded the one day level that cannot bloom, and left
    // dusk, which can, untested.
    //
    // Reformulated to assert the threshold where bloom is actually strong. At `d = 0.5` bloom is at
    // half strength and the cubic ramp puts the pane at 0.65.
    expect(glassSkyCatchIntensity(0.5)).toBeLessThan(1.05)
    expect(glassSkyCatchIntensity(0.4)).toBeLessThan(0.5)
  })

  it('reaches the (l) magnitude at full daylight, where bloom is off', () => {
    expect(glassSkyCatchIntensity(1)).toBeCloseTo(8.32, 6)
  })

  it('is dimmer than the old cubic curve through the DEEP-DUSK band, brighter near full day', () => {
    // `v0.31.7.281` raised the coefficient 5.2 -> 8.32 and the exponent 3 -> 4 together, so the
    // extra brightness is concentrated near `d = 1` where bloom is off. The ratio is exactly
    // `1.6 · d`, so the curves CROSS at `d = 0.625` — a curve that is higher at 1 and lower below
    // has to cross somewhere, and pretending otherwise is how the dusk guard gets weakened by
    // accident. Below the crossing, where bloom is strongest, the new curve is strictly lower.
    for (const d of [0.2, 0.4, 0.5, 0.6]) {
      expect(glassSkyCatchIntensity(d)).toBeLessThan(d * d * d * 5.2)
    }
    expect(glassSkyCatchIntensity(0.625)).toBeCloseTo(0.625 ** 3 * 5.2, 6)
    expect(glassSkyCatchIntensity(1)).toBeGreaterThan(5.2)
  })

  it('is EXACTLY ZERO at night, so the (l) fix cannot regress it', () => {
    // `(l)`'s standing constraint is that 21:00 must not regress, met by construction rather than
    // by a guard: no coefficient has anything to scale at zero daylight.
    expect(glassSkyCatchIntensity(0)).toBe(0)
    expect(glassSkyCatchIntensity(-0.5)).toBe(0)
  })
})

describe('windowGlassPhysical (PHOTO-GLASS)', () => {
  it('is null on Performance/Medium so cheap panes stay byte-identical', () => {
    expect(windowGlassPhysical('performance')).toBeNull()
    expect(windowGlassPhysical('performance')).toBeNull()
  })

  it('returns architectural-glass params in realistic', () => {
    for (const tier of ['realistic'] as const) {
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
  it('bounds the transmissive pass at 75% on a weak device, full res elsewhere', () => {
    // Parity: the old High rung took 0.75 and Maximum took 1, and those rungs are
    // now `realistic`/weak and `realistic`/capable.
    expect(transmissionResolutionScaleForTier('realistic', 'weak')).toBe(0.75)
    expect(transmissionResolutionScaleForTier('realistic', 'capable')).toBe(1)
    // Inert (no transmission pass) in performance — keep neutral 1.
    expect(transmissionResolutionScaleForTier('performance', 'weak')).toBe(1)
    expect(transmissionResolutionScaleForTier('performance', 'capable')).toBe(1)
  })
})
