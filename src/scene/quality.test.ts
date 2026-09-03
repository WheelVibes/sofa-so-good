import { describe, expect, it } from 'vitest'
import {
  DEVICE_CLASSES,
  type DeviceClass,
  effectiveAssetTier,
  presetFor,
  QUALITY_PRESETS,
  RENDER_TIERS,
  renderToAssetTier,
  resolveQuality,
} from './quality'

/**
 * The four settings objects the app produced before the modes were collapsed,
 * copied here BY VALUE.
 *
 * This is the parity contract. `performance`/`medium`/`high`/`maximum` were
 * retired in favour of two modes × two device classes, and the requirement was
 * that the visuals do not change — so rather than argue about it, the reachable
 * settings are pinned against literal copies of the retired presets. If any
 * field of any variant drifts, this fails and names the pair.
 *
 * Do NOT regenerate these from `QUALITY_PRESETS`; that would make the test
 * tautological and it would then permit exactly the drift it exists to catch.
 */
const RETIRED_PRESETS = {
  performance: {
    mergeCoincidentLights: true,
    shadowMapSize: 0,
    ibl: false,
    postprocessing: false,
    ao: false,
    dprMax: 1,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 0.7,
    showcase: false,
    aoFullRes: false,
    cinematic: false,
    dof: false,
    envResolution: 64,
  },
  medium: {
    mergeCoincidentLights: true,
    shadowMapSize: 1024,
    ibl: true,
    postprocessing: false,
    ao: true,
    dprMax: 1.5,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1,
    showcase: false,
    aoFullRes: false,
    cinematic: false,
    dof: false,
    envResolution: 96,
  },
  high: {
    mergeCoincidentLights: true,
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: true,
    ao: true,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1.4,
    showcase: false,
    aoFullRes: false,
    cinematic: false,
    dof: true,
    envResolution: 192,
  },
  maximum: {
    mergeCoincidentLights: true,
    shadowMapSize: 4096,
    ibl: true,
    postprocessing: true,
    ao: true,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1.8,
    showcase: false,
    aoFullRes: true,
    cinematic: true,
    dof: true,
    envResolution: 256,
  },
} as const

describe('PARITY with the retired four-tier ladder', () => {
  it('performance/weak is byte-identical to the old performance tier', () => {
    expect(presetFor('performance', 'weak')).toEqual(RETIRED_PRESETS.performance)
  })

  it('performance/capable is byte-identical to the old MEDIUM tier', () => {
    // The load-bearing one. Medium was documented as the rung "the adaptive
    // ladder auto-selects for most browsers", and it sits 17.6 counts of mean
    // difference from `high` and 24.3 from `performance` (img-diff, mainBedroom,
    // v0.31.7.68) — so folding it into either single mode would have changed what
    // most users see. Keeping it as a device variant is what makes the collapse
    // invisible.
    expect(presetFor('performance', 'capable')).toEqual(RETIRED_PRESETS.medium)
  })

  it('realistic/weak is byte-identical to the old high tier', () => {
    expect(presetFor('realistic', 'weak')).toEqual(RETIRED_PRESETS.high)
  })

  it('realistic/capable is byte-identical to the old maximum tier', () => {
    expect(presetFor('realistic', 'capable')).toEqual(RETIRED_PRESETS.maximum)
  })

  it('produces exactly four distinct settings objects — no more, no fewer', () => {
    // The set of pictures the app can render is unchanged. A fifth would mean a
    // look nobody has reviewed; a third would mean one was lost.
    const all = RENDER_TIERS.flatMap((t) => DEVICE_CLASSES.map((d) => presetFor(t, d)))
    expect(all).toHaveLength(4)
    expect(new Set(all.map((s) => JSON.stringify(s))).size).toBe(4)
  })
})

describe('the two modes', () => {
  it('has exactly performance and realistic', () => {
    expect(RENDER_TIERS).toEqual(['performance', 'realistic'])
  })

  it('has a preset for every mode and device class', () => {
    for (const t of RENDER_TIERS) {
      for (const d of DEVICE_CLASSES) expect(QUALITY_PRESETS[t][d]).toBeTruthy()
    }
  })

  it('orders device classes weak-then-capable, which the adaptive ladder steps along', () => {
    expect(DEVICE_CLASSES).toEqual(['weak', 'capable'])
  })

  it('never costs more on weak than on capable, for either mode', () => {
    for (const t of RENDER_TIERS) {
      const weak = presetFor(t, 'weak')
      const capable = presetFor(t, 'capable')
      expect(weak.shadowMapSize).toBeLessThanOrEqual(capable.shadowMapSize)
      expect(weak.dprMax).toBeLessThanOrEqual(capable.dprMax)
      expect(weak.envResolution).toBeLessThanOrEqual(capable.envResolution)
      expect(weak.geometryDetail).toBeLessThanOrEqual(capable.geometryDetail)
    }
  })

  it('grounds furniture with contact shadows everywhere, including the flattest variant (RZ1)', () => {
    for (const t of RENDER_TIERS) {
      for (const d of DEVICE_CLASSES) expect(presetFor(t, d).contactShadows).toBe(true)
    }
  })

  it('keeps the flattest variant flat — no shadows, IBL or post', () => {
    const p = presetFor('performance', 'weak')
    expect(p.shadowMapSize).toBe(0)
    expect(p.ibl).toBe(false)
    expect(p.postprocessing).toBe(false)
    expect(p.ao).toBe(false)
  })

  it('runs the post stack only in realistic', () => {
    for (const d of DEVICE_CLASSES) {
      expect(presetFor('performance', d).postprocessing).toBe(false)
      expect(presetFor('realistic', d).postprocessing).toBe(true)
    }
  })

  it('enables the cinematic finish and full-res AO only on realistic/capable', () => {
    for (const t of RENDER_TIERS) {
      for (const d of DEVICE_CLASSES) {
        const top = t === 'realistic' && d === 'capable'
        expect(presetFor(t, d).cinematic).toBe(top)
        expect(presetFor(t, d).aoFullRes).toBe(top)
      }
    }
  })

  it('only ever applies cinematic / full-res AO / DoF where the post stack runs', () => {
    for (const t of RENDER_TIERS) {
      for (const d of DEVICE_CLASSES) {
        const p = presetFor(t, d)
        if (p.cinematic || p.aoFullRes || p.dof) expect(p.postprocessing).toBe(true)
      }
    }
  })

  it('never has aoFullRes without ao', () => {
    for (const t of RENDER_TIERS) {
      for (const d of DEVICE_CLASSES) {
        const p = presetFor(t, d)
        if (p.aoFullRes) expect(p.ao).toBe(true)
      }
    }
  })

  it('gives performance/capable ambient occlusion WITHOUT the full post stack (TIER-AO)', () => {
    const p = presetFor('performance', 'capable')
    expect(p.ao).toBe(true)
    expect(p.postprocessing).toBe(false)
  })

  it('falls back to the flattest variant for an unknown mode or class', () => {
    // Persisted values reach this from other builds; a settings object of
    // `undefined` fields renders geometry with NaN segments and shows nothing.
    expect(presetFor('nope' as never, 'weak')).toEqual(RETIRED_PRESETS.performance)
    expect(presetFor('performance', 'nope' as never)).toEqual(RETIRED_PRESETS.performance)
  })
})

describe('renderToAssetTier', () => {
  it('maps each mode/class pair to the asset-LOD tier the old rung did', () => {
    // Old: performance→low, medium→medium, high→high, maximum→high.
    expect(renderToAssetTier('performance', 'weak')).toBe('low')
    expect(renderToAssetTier('performance', 'capable')).toBe('medium')
    expect(renderToAssetTier('realistic', 'weak')).toBe('high')
    expect(renderToAssetTier('realistic', 'capable')).toBe('high')
  })
})

describe('effectiveAssetTier', () => {
  it('follows the mode (via the asset mapping) when asset tier is Auto (null)', () => {
    expect(effectiveAssetTier(null, 'performance', 'weak')).toBe('low')
    expect(effectiveAssetTier(null, 'realistic', 'capable')).toBe('high')
  })

  it('ignores the mode when an asset tier is explicitly set', () => {
    expect(effectiveAssetTier('low', 'realistic', 'capable')).toBe('low')
    expect(effectiveAssetTier('high', 'performance', 'weak')).toBe('high')
  })
})

describe('resolveQuality — undefined override values (QUALITY-OVERRIDE-UNDEF)', () => {
  it('falls back to the preset instead of spreading undefined', () => {
    const r = resolveQuality(
      'realistic',
      { shadowMapSize: undefined, postprocessing: undefined },
      'capable',
    )
    expect(r.shadowMapSize).toBe(4096)
    expect(r.postprocessing).toBe(true)
  })

  it('still applies real override values', () => {
    expect(resolveQuality('realistic', { shadowMapSize: 1024 }, 'capable').shadowMapSize).toBe(1024)
    expect(resolveQuality('realistic', { postprocessing: false }, 'capable').postprocessing).toBe(
      false,
    )
  })

  it('keeps falsy-but-defined overrides, which are meaningful', () => {
    expect(resolveQuality('realistic', { shadowMapSize: 0 }, 'capable').shadowMapSize).toBe(0)
    expect(resolveQuality('realistic', { ibl: false }, 'capable').ibl).toBe(false)
  })

  it('ignores an all-undefined override map entirely', () => {
    const r = resolveQuality('realistic', { ibl: undefined, dprMax: undefined }, 'weak')
    expect(r).toEqual(presetFor('realistic', 'weak'))
  })

  it('defaults to the capable variant when no device class is given', () => {
    // The default exists so the 4 store-driven call sites read naturally; it must
    // be the RICHER one, because the alternative silently downgrades anyone whose
    // call site forgot to pass it.
    expect(resolveQuality('realistic', undefined)).toEqual(presetFor('realistic', 'capable'))
  })
})

describe('the device class ladder', () => {
  it('exposes the classes in cost order for the adaptive stepper', () => {
    const idx = (d: DeviceClass) => DEVICE_CLASSES.indexOf(d)
    expect(idx('weak')).toBeLessThan(idx('capable'))
  })
})
