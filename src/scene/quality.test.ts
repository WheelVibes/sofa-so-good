import { afterEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags, setResolvedFlags } from '../features/featureFlags'
import { probeVramMb } from './lighting/roomProbe'
import {
  DEVICE_CLASSES,
  type DeviceClass,
  effectiveAssetTier,
  presetFor,
  QUALITY_PRESETS,
  RENDER_TIERS,
  renderToAssetTier,
  resolveQuality,
  SOFTWARE_REALISTIC_FLOOR,
  softwareRealisticFloor,
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
    roomProbeResolution: 0,
    roomProbeMaxRooms: 0,
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
    roomProbeResolution: 0,
    roomProbeMaxRooms: 0,
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
    roomProbeResolution: 128,
    roomProbeMaxRooms: 4,
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
    roomProbeResolution: 256,
    roomProbeMaxRooms: 7,
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
      expect(weak.roomProbeResolution).toBeLessThanOrEqual(capable.roomProbeResolution)
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

  it('REQUIRES a device class — the parameter is not optional', () => {
    // This replaced a test that asserted a `capable` default and argued it was the
    // safe direction. It was not: all four call sites took the default, so the
    // class was detected, persisted and stepped by the adaptive ladder while the
    // renderer ignored it — a phone would have rendered the capable preset. The
    // arity is the guard, so assert the arity.
    expect(resolveQuality.length).toBe(3)
  })
})

describe('the device class ladder', () => {
  it('exposes the classes in cost order for the adaptive stepper', () => {
    const idx = (d: DeviceClass) => DEVICE_CLASSES.indexOf(d)
    expect(idx('weak')).toBeLessThan(idx('capable'))
  })
})

/**
 * REALISTIC-SOFTWARE-FALLBACK.
 *
 * The pure half is `softwareRealisticFloor` — it takes the flag state as an
 * argument so the off-state is testable without touching global flag state; the
 * layering half is `resolveQuality`, which reads the real flag. Both are covered,
 * because the bug this guards against is not "does the floor exist" but "is it
 * applied to the right machines, in the right ORDER relative to the user's
 * overrides". The measured justification is on `SOFTWARE_REALISTIC_FLOOR`.
 */
describe('the software-rasteriser Realistic floor', () => {
  /** Flip one flag in the module snapshot `isFeatureEnabled` reads. */
  function withFlag(on: boolean): void {
    setResolvedFlags({ ...resolveFlags(false, {}, false, 'simple'), softwareRasterFallback: on })
  }
  afterEach(() => {
    // Restore the real snapshot: `setResolvedFlags` is module-global, so leaving a
    // forced value here would silently reconfigure every later test in the file.
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
  })

  it('ships ON by default (v0.33.2.9) — the narrow option-(3) floor was certified', () => {
    expect(FEATURE_FLAGS.softwareRasterFallback.default).toBe(true)
  })

  describe('softwareRealisticFloor (pure)', () => {
    it('applies the baked-only floor to Realistic on a software rasteriser', () => {
      expect(softwareRealisticFloor('realistic', true, true)).toEqual(SOFTWARE_REALISTIC_FLOOR)
    })

    it('does NOT touch Performance — that mode is already flat and cheap', () => {
      expect(softwareRealisticFloor('performance', true, true)).toEqual({})
    })

    it('does NOT touch a real GPU', () => {
      expect(softwareRealisticFloor('realistic', false, true)).toEqual({})
    })

    it('does nothing with the flag off', () => {
      expect(softwareRealisticFloor('realistic', true, false)).toEqual({})
    })

    it('keeps the OCCLUSION: post, AO and the probe are absent from the floor', () => {
      // Option (3) (v0.33.2.9). ABSENCE is the mechanism — a key missing from the
      // floor means `resolveQuality` lets the preset's own value through. `ibl`,
      // `postprocessing`, `ao` and `envResolution` must therefore never appear
      // here: they are what carry the corner/contact darkening that made the wide
      // v0.33.2.0 floor measure flat, and post being mounted is also what keeps
      // `shouldDegradeDpr` armed. The visibility lightmaps are gated on the MODE,
      // so they survive regardless.
      for (const key of ['ibl', 'postprocessing', 'ao', 'envResolution'] as const) {
        expect(key in SOFTWARE_REALISTIC_FLOOR).toBe(false)
      }
    })

    it('drops exactly the four per-frame costs option (3) certified', () => {
      expect(SOFTWARE_REALISTIC_FLOOR).toEqual({
        shadowMapSize: 0,
        dof: false,
        cinematic: false,
        dprMax: 1,
      })
    })
  })

  describe('resolveQuality layering', () => {
    it('floors Realistic on a software rasteriser to exactly the option-(3) keys', () => {
      withFlag(true)
      const r = resolveQuality('realistic', undefined, 'weak', true)
      expect(r.shadowMapSize).toBe(0)
      expect(r.dof).toBe(false)
      expect(r.cinematic).toBe(false)
      expect(r.dprMax).toBe(1)
    })

    it('does NOT touch post, AO, the probe or `ibl` — the weak preset survives', () => {
      // The half of option (3) that distinguishes it from the v0.33.2.0 floor, and
      // the reason it matches full Realistic to within a point: these four come
      // through from `realistic`/`weak` untouched (post true, AO true, probe 192).
      withFlag(true)
      const r = resolveQuality('realistic', undefined, 'weak', true)
      const preset = presetFor('realistic', 'weak')
      expect(r.postprocessing).toBe(preset.postprocessing)
      expect(r.ao).toBe(preset.ao)
      expect(r.envResolution).toBe(preset.envResolution)
      expect(r.ibl).toBe(preset.ibl)
      expect(r.postprocessing).toBe(true)
      expect(r.ao).toBe(true)
      expect(r.envResolution).toBe(192)
      expect(r.ibl).toBe(true)
    })

    it('differs from the weak preset in the floored keys ONLY', () => {
      withFlag(true)
      const r = resolveQuality('realistic', undefined, 'weak', true)
      const preset = presetFor('realistic', 'weak')
      const changed = Object.keys(preset)
        .filter((k) => r[k as keyof typeof r] !== preset[k as keyof typeof preset])
        .sort()
      // `cinematic` is in the floor but already `false` on `realistic`/`weak` — it
      // only bites the CAPABLE class, which a CPU renderer can also reach (the
      // class ladder is independent of the renderer name).
      expect(changed).toEqual(['dof', 'dprMax', 'shadowMapSize'])
      expect(preset.cinematic).toBe(false)
      expect(resolveQuality('realistic', undefined, 'capable', true).cinematic).toBe(false)
      expect(presetFor('realistic', 'capable').cinematic).toBe(true)
    })

    it('floors the CAPABLE class too — a CPU renderer is not a fast machine', () => {
      withFlag(true)
      expect(resolveQuality('realistic', undefined, 'capable', true).shadowMapSize).toBe(0)
    })

    it('leaves Performance alone on the same machine', () => {
      withFlag(true)
      expect(resolveQuality('performance', undefined, 'weak', true)).toEqual(
        presetFor('performance', 'weak'),
      )
    })

    it('PHONES ARE UNAFFECTED: `weak` alone never triggers the floor', () => {
      // The regression that would matter most. `deviceClassFor` sends a phone AND a
      // software rasteriser to `weak`; only the second may be floored.
      withFlag(true)
      expect(resolveQuality('realistic', undefined, 'weak', false)).toEqual(
        presetFor('realistic', 'weak'),
      )
    })

    it('is unchanged when the argument is omitted, on every mode and class', () => {
      withFlag(true)
      for (const t of RENDER_TIERS) {
        for (const d of DEVICE_CLASSES) {
          expect(resolveQuality(t, undefined, d)).toEqual(presetFor(t, d))
        }
      }
    })

    it('is unchanged with the flag off', () => {
      withFlag(false)
      expect(resolveQuality('realistic', undefined, 'weak', true)).toEqual(
        presetFor('realistic', 'weak'),
      )
    })

    it('lets a USER OVERRIDE beat the floor — an explicit choice still wins', () => {
      withFlag(true)
      const r = resolveQuality(
        'realistic',
        { postprocessing: true, shadowMapSize: 1024, dprMax: 2 },
        'weak',
        true,
      )
      expect(r.postprocessing).toBe(true)
      expect(r.shadowMapSize).toBe(1024)
      expect(r.dprMax).toBe(2)
      // Not in the floor at all, so the preset's value comes through regardless.
      expect(r.ao).toBe(true)
      expect(r.envResolution).toBe(192)
      // Overridden by neither, so still floored.
      expect(r.dof).toBe(false)
      expect(r.cinematic).toBe(false)
    })

    it('does not let an `undefined` override resurrect a floored setting', () => {
      // QUALITY-OVERRIDE-UNDEF, re-checked against the new layer: a cleared
      // override must fall back to the FLOOR, not to the preset's 2048.
      withFlag(true)
      expect(
        resolveQuality('realistic', { shadowMapSize: undefined }, 'weak', true).shadowMapSize,
      ).toBe(0)
    })
  })
})

// ROOM-PROBES (R7-L). Two invariants, both structural rather than cosmetic.
describe('roomProbeResolution', () => {
  const cells = [
    ['performance', 'weak'],
    ['performance', 'capable'],
    ['realistic', 'weak'],
    ['realistic', 'capable'],
  ] as const

  it('is 0 wherever there is no IBL — there is no envMap to patch', () => {
    for (const [tier, device] of cells) {
      const p = presetFor(tier, device)
      if (!p.ibl) expect(p.roomProbeResolution).toBe(0)
    }
  })

  it('runs only where the baked GI does, i.e. only in realistic', () => {
    // The probe completes the light transport the Cycles bake started. On `performance` there
    // is no bake, so a per-room specular term would be the only spatially-varying light in an
    // otherwise analytic render — a mismatch, not an improvement.
    for (const [tier, device] of cells) {
      const p = presetFor(tier, device)
      if (p.roomProbeResolution > 0) expect(tier).toBe('realistic')
    }
  })

  it('shares a PMREM size with envResolution, which the shader macros require', () => {
    // `textureCubeUV` reads CUBEUV_* preprocessor macros that three derives from the bound
    // `envMap`, and one program has one set of them — so the room probe's PMREM must have the
    // same dimensions as the global probe's. PMREMGenerator floors its source to a power of
    // two, so it is THAT value which has to agree, not the raw resolution.
    const pmremSize = (n: number) => 2 ** Math.floor(Math.log2(n))
    for (const [tier, device] of cells) {
      const p = presetFor(tier, device)
      if (p.roomProbeResolution === 0) continue
      expect(pmremSize(p.roomProbeResolution)).toBe(pmremSize(p.envResolution))
    }
  })

  // ROOM-PROBES (R7-N). The room BUDGET, which is the feature's whole VRAM cost.
  it('costs literally nothing on either performance variant', () => {
    // The phone tier's zero is structural — no resolution AND no rooms — so it cannot be
    // reintroduced by relaxing one of them alone. The mobile ladder rung asserts `patched=0`
    // against this.
    for (const device of ['weak', 'capable'] as const) {
      const p = presetFor('performance', device)
      expect(p.roomProbeResolution).toBe(0)
      expect(p.roomProbeMaxRooms).toBe(0)
      expect(probeVramMb(p.roomProbeResolution, p.roomProbeMaxRooms)).toBe(0)
    }
  })

  it('pins the VRAM each realistic variant may spend, in MB', () => {
    // A PMREM target is `3 * max(N, 112) x 4N` at RGBA16F. These two numbers are the reason the
    // cap exists at all — unbounded, all 11 rooms of the default flat qualified and the feature
    // allocated 69 MB. Change either preset and this fails with the new price in the message.
    const weak = presetFor('realistic', 'weak')
    const capable = presetFor('realistic', 'capable')
    expect(probeVramMb(weak.roomProbeResolution, weak.roomProbeMaxRooms)).toBeCloseTo(6.0, 1)
    expect(probeVramMb(capable.roomProbeResolution, capable.roomProbeMaxRooms)).toBeCloseTo(42.0, 1)
  })

  it('never lets the weak variant of a mode outspend the capable one', () => {
    for (const tier of RENDER_TIERS) {
      const weak = presetFor(tier, 'weak')
      const capable = presetFor(tier, 'capable')
      expect(weak.roomProbeMaxRooms).toBeLessThanOrEqual(capable.roomProbeMaxRooms)
      expect(probeVramMb(weak.roomProbeResolution, weak.roomProbeMaxRooms)).toBeLessThanOrEqual(
        probeVramMb(capable.roomProbeResolution, capable.roomProbeMaxRooms),
      )
    }
  })

  it('gives every room a budget slot only where there is a resolution to spend it at', () => {
    for (const [tier, device] of cells) {
      const p = presetFor(tier, device)
      expect(p.roomProbeMaxRooms > 0).toBe(p.roomProbeResolution > 0)
    }
  })
})
