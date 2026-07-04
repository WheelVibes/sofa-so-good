import { describe, expect, it } from 'vitest'
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  parseFlagOverrides,
  parseStoredOverrides,
  resolveFlags,
} from './featureFlags'

describe('resolveFlags', () => {
  it('production uses registry defaults and forces devOnly flags off', () => {
    const prod = resolveFlags(false, {})
    expect(prod.report).toBe(FEATURE_FLAGS.report.default)
    expect(prod.ikeaLive).toBe(false) // devOnly
    expect(prod.livePrices).toBe(false) // devOnly
  })

  it('ignores overrides in production (a shipped build is locked to the registry)', () => {
    const prod = resolveFlags(false, { report: false, ikeaLive: true })
    expect(prod.report).toBe(true) // override ignored
    expect(prod.ikeaLive).toBe(false) // devOnly stays off even if overridden on
  })

  it('applies overrides in dev (incl. turning a devOnly flag off)', () => {
    const dev = resolveFlags(true, { report: false, ikeaLive: false })
    expect(dev.report).toBe(false)
    expect(dev.ikeaLive).toBe(false)
    // A devOnly flag defaults on in dev when not overridden.
    expect(resolveFlags(true, {}).ikeaLive).toBe(true)
  })

  it('covers every registry key', () => {
    const out = resolveFlags(true, {})
    expect(Object.keys(out).sort()).toEqual([...FEATURE_FLAG_KEYS].sort())
  })

  it('an admin (prod build) unlocks devOnly flags + honours overrides', () => {
    const admin = resolveFlags(false, { report: false }, true)
    expect(admin.ikeaLive).toBe(true) // devOnly unlocked for admin
    expect(admin.report).toBe(false) // admin override honoured
    // A non-admin prod session stays locked regardless.
    const normal = resolveFlags(false, { report: false }, false)
    expect(normal.ikeaLive).toBe(false)
    expect(normal.report).toBe(true)
  })
})

describe('Simple/Pro tiering', () => {
  it('every flag declares a valid tier', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      expect(['simple', 'pro']).toContain(FEATURE_FLAGS[key].tier)
    }
  })

  it('Simple mode hides every pro feature and keeps every simple feature', () => {
    // Privileged (dev) so overrides/devOnly aren't the thing being tested here.
    const simple = resolveFlags(true, {}, false, 'simple')
    for (const key of FEATURE_FLAG_KEYS) {
      const def = FEATURE_FLAGS[key]
      if (def.tier === 'pro') {
        expect(simple[key]).toBe(false)
      } else if (!def.devOnly) {
        expect(simple[key]).toBe(def.default)
      }
    }
  })

  it('Pro mode restores pro features to their normal resolution', () => {
    const pro = resolveFlags(true, {}, false, 'pro')
    // A representative pro feature is on in pro, off in simple.
    expect(pro.drawings).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').drawings).toBe(false)
    // Simple features are unaffected by the mode.
    expect(pro.smartStart).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').smartStart).toBe(true)
  })

  it('furnitureGroups (pro tier) is present in Pro and hidden in Simple', () => {
    // Grouping is an advanced authoring tool → pro; the UI gates on this flag so
    // it disappears from Simple's minimal core loop.
    expect(resolveFlags(true, {}, false, 'pro').furnitureGroups).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').furnitureGroups).toBe(false)
  })

  it('pathArray (pro tier) is present in Pro and hidden in Simple', () => {
    // Duplicate-along-path (PARITY-DUP-PATH) is advanced array tooling → pro; the
    // inspector section gates on this flag so it disappears from Simple's core loop.
    expect(resolveFlags(true, {}, false, 'pro').pathArray).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').pathArray).toBe(false)
    // Prod (non-dev) default is on in Pro (pure-code, no sidecar/licence) …
    expect(resolveFlags(false, {}, false, 'pro').pathArray).toBe(true)
    // … and still forced off in Simple.
    expect(resolveFlags(false, {}, false, 'simple').pathArray).toBe(false)
  })

  it('shopExport (simple tier) resolves the same in BOTH modes (gates the room-schedule CSV)', () => {
    // The room-schedule + furniture-list + shopping-list exports all gate on
    // shopExport (simple tier, default off). Its resolution must not depend on
    // the Simple/Pro mode — only on the flag itself.
    expect(resolveFlags(true, {}, false, 'simple').shopExport).toBe(
      FEATURE_FLAGS.shopExport.default,
    )
    expect(resolveFlags(true, {}, false, 'pro').shopExport).toBe(FEATURE_FLAGS.shopExport.default)
    // When turned on (dev override), it is on in both modes.
    expect(resolveFlags(true, { shopExport: true }, false, 'simple').shopExport).toBe(true)
    expect(resolveFlags(true, { shopExport: true }, false, 'pro').shopExport).toBe(true)
  })

  it('sceneExport3d (simple tier) is present in BOTH Simple and Pro modes', () => {
    // Whole-scene 3D export is part of the curated launch set → simple tier.
    expect(resolveFlags(true, {}, false, 'simple').sceneExport3d).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').sceneExport3d).toBe(true)
  })

  it('wallBaseboard (simple tier) is present in BOTH Simple and Pro modes', () => {
    // Per-wall baseboard params are part of the curated launch set → simple tier.
    expect(resolveFlags(true, {}, false, 'simple').wallBaseboard).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').wallBaseboard).toBe(true)
  })

  it('batchRender (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    // Batch PNG-per-view export is an advanced presentation/output feature → pro.
    expect(resolveFlags(true, {}, false, 'simple').batchRender).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').batchRender).toBe(true)
  })

  it('tiltFurniture (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    // Multi-axis tilt is an advanced placement control → pro tier. Gates BOTH
    // the inspector's TiltControls sliders AND the in-viewport TiltGizmo drag
    // handle (PARITY-TILT tail) — one capability, one flag.
    expect(resolveFlags(true, {}, false, 'simple').tiltFurniture).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').tiltFurniture).toBe(true)
  })

  it('catalogModelInfo (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'simple').catalogModelInfo).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').catalogModelInfo).toBe(true)
  })

  it('planMirrorRegion (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    // Mirror-a-plan-region is an advanced authoring tool → pro tier.
    expect(resolveFlags(true, {}, false, 'simple').planMirrorRegion).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').planMirrorRegion).toBe(true)
    // Prod-safe pure geometry → default on (present in a prod Pro build).
    expect(resolveFlags(false, {}, false, 'pro').planMirrorRegion).toBe(true)
  })

  it('curvedWalls (simple tier) is present in BOTH Simple and Pro modes', () => {
    expect(resolveFlags(true, {}, false, 'simple').curvedWalls).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').curvedWalls).toBe(true)
  })

  it('slopingWalls (simple tier) is present in BOTH Simple and Pro modes', () => {
    expect(resolveFlags(true, {}, false, 'simple').slopingWalls).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').slopingWalls).toBe(true)
  })

  it('viewInAr (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'simple').viewInAr).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').viewInAr).toBe(true)
  })

  it('scatterFill (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    // Scatter-fill is an advanced bulk-placement/layout tool → pro tier.
    expect(resolveFlags(true, {}, false, 'simple').scatterFill).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').scatterFill).toBe(true)
  })

  it('floorTexture (simple tier) is present in BOTH Simple and Pro modes', () => {
    expect(resolveFlags(true, {}, false, 'simple').floorTexture).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').floorTexture).toBe(true)
  })

  it('planCompass (simple tier) is present in BOTH Simple and Pro modes', () => {
    expect(resolveFlags(true, {}, false, 'simple').planCompass).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').planCompass).toBe(true)
  })

  it('shopExport (simple tier, prod default OFF) is off in BOTH Simple and Pro modes', () => {
    // Production build, no overrides — the shoppable buy-list is off by default
    // (not production-ready), in both modes…
    expect(resolveFlags(false, {}, false, 'simple').shopExport).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').shopExport).toBe(false)
    // …while the brand-link gate (ikeaLive, devOnly) also stays off in prod.
    expect(resolveFlags(false, {}, false, 'pro').ikeaLive).toBe(false)
    // A privileged (dev/admin) override can still turn it on.
    expect(resolveFlags(true, { shopExport: true }, false, 'pro').shopExport).toBe(true)
  })

  it('finishDnd (simple tier, prod default on) is available in BOTH Simple and Pro modes', () => {
    // Drag-to-apply finishes is part of the core "finish" loop, so a production
    // build keeps it on in the default Simple mode as well as in Pro.
    expect(resolveFlags(false, {}, false, 'simple').finishDnd).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').finishDnd).toBe(true)
  })

  it('panoTour (simple tier, prod default OFF) is opt-in but present in BOTH modes when enabled', () => {
    // The linked 360° tour is an advanced presentation surface — off by default.
    expect(resolveFlags(false, {}, false, 'simple').panoTour).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').panoTour).toBe(false)
    expect(resolveFlags(true, {}, false, 'simple').panoTour).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').panoTour).toBe(false)
    // Simple-tier: when explicitly enabled it shows in both modes (not pro-gated).
    expect(resolveFlags(true, { panoTour: true }, false, 'simple').panoTour).toBe(true)
    expect(resolveFlags(true, { panoTour: true }, false, 'pro').panoTour).toBe(true)
    // Tiered consistently with the single-shot panorama it builds on.
    expect(FEATURE_FLAGS.panoTour.tier).toBe(FEATURE_FLAGS.panorama.tier)
  })

  it('replaceSimilar (simple tier, prod default on) is present in BOTH Simple and Pro', () => {
    // Replace-with-similar is part of the curated launch set → simple tier, prod-safe.
    expect(resolveFlags(false, {}, false, 'simple').replaceSimilar).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').replaceSimilar).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').replaceSimilar).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').replaceSimilar).toBe(true)
  })

  it('planPolyline (simple tier, prod default on) is present in BOTH Simple and Pro', () => {
    // Free-form polyline markup ships in the curated launch set → simple tier.
    expect(resolveFlags(false, {}, false, 'simple').planPolyline).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').planPolyline).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').planPolyline).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').planPolyline).toBe(true)
  })

  it('wallNumericEntry (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    // Numeric wall-length/angle entry is an authoring/pro tool in the 2D plan editor.
    expect(resolveFlags(false, {}, false, 'simple').wallNumericEntry).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').wallNumericEntry).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').wallNumericEntry).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').wallNumericEntry).toBe(true)
    // The flag is in the registry with the correct tier.
    expect(FEATURE_FLAGS.wallNumericEntry.tier).toBe('pro')
    expect(FEATURE_FLAGS.wallNumericEntry.default).toBe(true)
  })

  it('stagingReveal (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    // Before/after reveal is a presentation flourish, not the core design loop.
    expect(resolveFlags(false, {}, false, 'simple').stagingReveal).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').stagingReveal).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').stagingReveal).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').stagingReveal).toBe(true)
    expect(FEATURE_FLAGS.stagingReveal.tier).toBe('pro')
    expect(FEATURE_FLAGS.stagingReveal.default).toBe(true)
  })

  it('timeCompare (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    // Time-of-day comparison reveal (FEAT-1) is an analytical "how does this
    // room read across the day" view, not the core furnish/finish loop.
    expect(resolveFlags(false, {}, false, 'simple').timeCompare).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').timeCompare).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').timeCompare).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').timeCompare).toBe(true)
    expect(FEATURE_FLAGS.timeCompare.tier).toBe('pro')
    expect(FEATURE_FLAGS.timeCompare.default).toBe(true)
  })

  it('styleTransfer (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').styleTransfer).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').styleTransfer).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').styleTransfer).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').styleTransfer).toBe(true)
    expect(FEATURE_FLAGS.styleTransfer.tier).toBe('pro')
    expect(FEATURE_FLAGS.styleTransfer.default).toBe(true)
  })

  it('styleQuiz (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').styleQuiz).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').styleQuiz).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').styleQuiz).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').styleQuiz).toBe(true)
    expect(FEATURE_FLAGS.styleQuiz.tier).toBe('pro')
    expect(FEATURE_FLAGS.styleQuiz.default).toBe(true)
  })

  it('Simple mode wins over a dev override (pro stays hidden)', () => {
    const simple = resolveFlags(true, { drawings: true }, false, 'simple')
    expect(simple.drawings).toBe(false)
  })

  it('defaults to Pro when no mode is passed (non-store callers see everything)', () => {
    expect(resolveFlags(true, {}).drawings).toBe(true)
  })
})

describe('iesLights flag (PC-IES-LIGHT)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').iesLights).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').iesLights).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').iesLights).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').iesLights).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.iesLights.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.iesLights.default).toBe(true)
    expect(FEATURE_FLAGS.iesLights.tier).toBe('pro')
  })
})

describe('remoteFurniture flag (AI-INTEG-001a)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode (both build kinds)', () => {
    // Browsable CC0 3D models (Poly Haven) are an advanced/external surface →
    // hidden in Simple where the catalog keeps only the curated builtin loop.
    expect(resolveFlags(false, {}, false, 'simple').remoteFurniture).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').remoteFurniture).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').remoteFurniture).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').remoteFurniture).toBe(true)
  })
  it('ships in prod (CORS-direct CC0, no devOnly gate) and mirrors remoteMaterials', () => {
    expect(FEATURE_FLAGS.remoteFurniture.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.remoteFurniture.default).toBe(true)
    expect(FEATURE_FLAGS.remoteFurniture.tier).toBe('pro')
    // Tiered consistently with the material browser it parallels.
    expect(FEATURE_FLAGS.remoteFurniture.tier).toBe(FEATURE_FLAGS.remoteMaterials.tier)
  })
})

describe('proceduralSky flag (RD-412)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode (both build kinds)', () => {
    // The sun-driven sky is an advanced atmosphere/realism option beyond the
    // curated static backdrops → hidden in Simple, on in Pro.
    expect(resolveFlags(false, {}, false, 'simple').proceduralSky).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').proceduralSky).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').proceduralSky).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').proceduralSky).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.proceduralSky.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.proceduralSky.default).toBe(true)
    expect(FEATURE_FLAGS.proceduralSky.tier).toBe('pro')
  })
})

describe('parseFlagOverrides (URL ?ff=)', () => {
  it('parses on/off pairs for known flags, ignoring junk', () => {
    expect(parseFlagOverrides('report:off,walkthrough:on')).toEqual({
      report: false,
      walkthrough: true,
    })
    expect(parseFlagOverrides('bogus:on,report:maybe,report:off')).toEqual({ report: false })
    expect(parseFlagOverrides('')).toEqual({})
    expect(parseFlagOverrides(null)).toEqual({})
  })
})

describe('parseStoredOverrides (localStorage JSON)', () => {
  it('keeps boolean values for known flags only', () => {
    expect(parseStoredOverrides('{"report":false,"nope":true,"budget":"x"}')).toEqual({
      report: false,
    })
  })
  it('tolerates bad JSON / empty', () => {
    expect(parseStoredOverrides('not json')).toEqual({})
    expect(parseStoredOverrides(null)).toEqual({})
  })
})

describe('textBrief flag (Smart Start describe-it box)', () => {
  it('is OFF by default in BOTH Simple and Pro modes (simple-tier, prod default off)', () => {
    expect(resolveFlags(false, {}, false, 'simple').textBrief).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').textBrief).toBe(false)
  })
  it('can still be turned on by a privileged (dev/admin) override', () => {
    expect(resolveFlags(true, { textBrief: true }, false, 'pro').textBrief).toBe(true)
  })
})

describe('panorama flag (360° capture)', () => {
  it('is OFF by default (opt-in) but simple-tier — present in both modes when enabled', () => {
    expect(resolveFlags(false, {}, false, 'simple').panorama).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').panorama).toBe(false)
    // Overrides only apply to a privileged session (dev build / admin).
    expect(resolveFlags(true, { panorama: true }, false, 'simple').panorama).toBe(true)
    expect(resolveFlags(true, { panorama: true }, false, 'pro').panorama).toBe(true)
  })
})

describe('presentation flag (slideshow + 360° slides)', () => {
  it('is pro-tier: hidden in Simple, present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').presentation).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').presentation).toBe(true)
  })
})

describe('renderPresets flag (F4)', () => {
  it('is simple-tier: enabled in both Simple and Pro by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').renderPresets).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').renderPresets).toBe(true)
  })
})

describe('contactShadows flag (RZ1)', () => {
  it('is simple-tier: grounding shadows stay on in both Simple and Pro by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').contactShadows).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').contactShadows).toBe(true)
  })
})

describe('cornerAo flag (RD-403)', () => {
  it('is simple-tier: baked corner AO stays on in both Simple and Pro by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').cornerAo).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').cornerAo).toBe(true)
  })
})

describe('hqRender flag (F1)', () => {
  it('is simple-tier: present in both Simple and Pro by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').hqRender).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').hqRender).toBe(true)
  })
})

describe('drawings flag (LP — also gates the 3D lux floor overlay, LP5 tail)', () => {
  it('is pro-tier: the Drawings panel AND the lux overlay are hidden in Simple, present in Pro', () => {
    // The overlay rides the same flag as the lighting plan it visualises
    // (LP1–LP5 all shipped under `drawings`): off in Simple → the scene
    // overlay + its panel toggle never mount; on in Pro by default.
    expect(resolveFlags(false, {}, false, 'simple').drawings).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').drawings).toBe(true)
  })
})

describe('comments flag (F24)', () => {
  it('is pro-tier: hidden in Simple, present in Pro (prod default on)', () => {
    expect(resolveFlags(false, {}, false, 'simple').comments).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').comments).toBe(true)
  })
})

describe('parametricFurniture flag (PF1)', () => {
  it('is simple-tier: present in both Simple and Pro (prod default on)', () => {
    expect(resolveFlags(false, {}, false, 'simple').parametricFurniture).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').parametricFurniture).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.parametricFurniture.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.parametricFurniture.default).toBe(true)
  })
})

describe('vrWalkthrough flag (F21)', () => {
  it('is pro-tier: hidden in Simple, present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').vrWalkthrough).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').vrWalkthrough).toBe(true)
  })
})

describe('radialArray flag (PC-ARRAY-RADIAL)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').radialArray).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').radialArray).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.radialArray.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.radialArray.default).toBe(true)
    expect(FEATURE_FLAGS.radialArray.tier).toBe('pro')
  })
})

describe('walkCameraControls flag (PARITY-WALKCAM)', () => {
  it('is simple-tier: present in both Simple and Pro (both build kinds)', () => {
    expect(resolveFlags(false, {}, false, 'simple').walkCameraControls).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').walkCameraControls).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').walkCameraControls).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').walkCameraControls).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.walkCameraControls.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.walkCameraControls.default).toBe(true)
    expect(FEATURE_FLAGS.walkCameraControls.tier).toBe('simple')
  })
})

describe('cameraDof flag (PC2-CAM-DOF-LENS)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode (both build kinds)', () => {
    // Lens + depth-of-field is an advanced photographic control → hidden in
    // Simple where the camera UI keeps only the core view loop.
    expect(resolveFlags(false, {}, false, 'simple').cameraDof).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').cameraDof).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').cameraDof).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').cameraDof).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.cameraDof.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.cameraDof.default).toBe(true)
    expect(FEATURE_FLAGS.cameraDof.tier).toBe('pro')
  })
})

describe('twoPointPerspective flag (FEAT-D)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode (both build kinds)', () => {
    // Vertical-line-lock is an advanced photographic camera control → hidden
    // in Simple where the camera UI keeps only the core view loop.
    expect(resolveFlags(false, {}, false, 'simple').twoPointPerspective).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').twoPointPerspective).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').twoPointPerspective).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').twoPointPerspective).toBe(true)
  })
  it('ships in prod (pure code, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.twoPointPerspective.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.twoPointPerspective.default).toBe(true)
    expect(FEATURE_FLAGS.twoPointPerspective.tier).toBe('pro')
  })
})

describe('infoCallouts flag (P25 progressive-disclosure hints)', () => {
  it('is simple-tier: present in BOTH Simple and Pro modes (both build kinds)', () => {
    // Dismissible first-run hint banners aid beginners in the default experience,
    // so they show in both Simple and Pro (simple tier, prod-safe, default on).
    expect(resolveFlags(false, {}, false, 'simple').infoCallouts).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').infoCallouts).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').infoCallouts).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').infoCallouts).toBe(true)
  })
  it('ships in prod (pure UI, no devOnly gate) with the right tier + default', () => {
    expect(FEATURE_FLAGS.infoCallouts.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.infoCallouts.default).toBe(true)
    expect(FEATURE_FLAGS.infoCallouts.tier).toBe('simple')
  })
})

describe('importSh3d flag (PARITY-SH3D)', () => {
  it('is pro-tier: hidden in Simple mode, present in Pro mode (both build kinds)', () => {
    // Importing a Sweet Home 3D plan is a plan-interop / authoring surface beyond
    // the core furnish loop → hidden in Simple where the UI stays minimal.
    expect(resolveFlags(false, {}, false, 'simple').importSh3d).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').importSh3d).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').importSh3d).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').importSh3d).toBe(true)
  })
  it('ships in prod (pure client-side parse, no devOnly gate)', () => {
    expect(FEATURE_FLAGS.importSh3d.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.importSh3d.default).toBe(true)
    expect(FEATURE_FLAGS.importSh3d.tier).toBe('pro')
  })
})

describe('newBadges flag (P27 "New" feature badges)', () => {
  it('is simple-tier: present in BOTH Simple and Pro modes (both build kinds)', () => {
    // The pulsing "New" dot is a discoverability aid useful to everyone (it can
    // badge both simple- and pro-tier target entries), so the flag itself shows
    // in both Simple and Pro (simple tier, prod-safe, default on).
    expect(resolveFlags(false, {}, false, 'simple').newBadges).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').newBadges).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').newBadges).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').newBadges).toBe(true)
  })
  it('ships in prod (pure UI, no devOnly gate) with the right tier + default', () => {
    expect(FEATURE_FLAGS.newBadges.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.newBadges.default).toBe(true)
    expect(FEATURE_FLAGS.newBadges.tier).toBe('simple')
  })
})

describe('densityMode flag (P38)', () => {
  it('is pro-tier, ships in prod (no devOnly gate)', () => {
    expect(FEATURE_FLAGS.densityMode.default).toBe(true)
    expect(FEATURE_FLAGS.densityMode.tier).toBe('pro')
    expect(FEATURE_FLAGS.densityMode.devOnly).toBeUndefined()
  })

  it('is present in Pro mode and hidden in Simple mode (both build kinds)', () => {
    expect(resolveFlags(false, {}, false, 'simple').densityMode).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').densityMode).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').densityMode).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').densityMode).toBe(true)
  })
})

describe('ambientFx flag (P7 decorative ambient effects)', () => {
  it('is simple-tier, ships in prod, default on', () => {
    expect(FEATURE_FLAGS.ambientFx.default).toBe(true)
    expect(FEATURE_FLAGS.ambientFx.tier).toBe('simple')
    expect(FEATURE_FLAGS.ambientFx.devOnly).toBeUndefined()
  })

  it('is present in BOTH Simple and Pro modes (both build kinds)', () => {
    // Simple-tier polish for all users; the real GPU guard is runtime
    // (useAmbientFx() renders nothing under the default Performance tier or
    // reduced-motion), so the flag stays on regardless of uiMode.
    expect(resolveFlags(false, {}, false, 'simple').ambientFx).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').ambientFx).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').ambientFx).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').ambientFx).toBe(true)
  })
})

describe('furnitureMotion flag (bug #15 — animate fan blades toggle)', () => {
  it('is simple-tier, ships in prod, default on', () => {
    expect(FEATURE_FLAGS.furnitureMotion.default).toBe(true)
    expect(FEATURE_FLAGS.furnitureMotion.tier).toBe('simple')
    expect(FEATURE_FLAGS.furnitureMotion.devOnly).toBeUndefined()
  })

  it('is present in BOTH Simple and Pro modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').furnitureMotion).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').furnitureMotion).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').furnitureMotion).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').furnitureMotion).toBe(true)
  })
})

describe('AI surfaces (aiPhotoreal / aiWalls / aiLayout — IXT-SUITES AI-surfaces rung)', () => {
  // All three are experimental BYO-key AI features (no bundled key, no
  // sidecar): pure client code that fails soft with no key, so — unlike
  // ikeaLive/livePrices — they are NOT devOnly and ship in prod, but are
  // pro-tier (hidden in Simple, where the UI stays the minimal core loop).
  it('are pro-tier, ship in prod (no devOnly gate), default on', () => {
    for (const key of ['aiPhotoreal', 'aiWalls', 'aiLayout'] as const) {
      expect(FEATURE_FLAGS[key].tier).toBe('pro')
      expect(FEATURE_FLAGS[key].devOnly).toBeUndefined()
      expect(FEATURE_FLAGS[key].default).toBe(true)
    }
  })

  it('are hidden in Simple mode and present in Pro mode (both build kinds)', () => {
    for (const key of ['aiPhotoreal', 'aiWalls', 'aiLayout'] as const) {
      expect(resolveFlags(false, {}, false, 'simple')[key]).toBe(false)
      expect(resolveFlags(false, {}, false, 'pro')[key]).toBe(true)
      expect(resolveFlags(true, {}, false, 'simple')[key]).toBe(false)
      expect(resolveFlags(true, {}, false, 'pro')[key]).toBe(true)
    }
  })
})

describe('proUpsell flag (P26 Simple→Pro ⌘K footer hint)', () => {
  it('is simple-tier, ships in prod, default on', () => {
    expect(FEATURE_FLAGS.proUpsell.default).toBe(true)
    expect(FEATURE_FLAGS.proUpsell.tier).toBe('simple')
    expect(FEATURE_FLAGS.proUpsell.devOnly).toBeUndefined()
  })

  it('is present in BOTH Simple and Pro modes (both build kinds)', () => {
    // A simple-tier flag stays on regardless of uiMode — the component itself
    // (not the flag) decides to render null in Pro mode.
    expect(resolveFlags(false, {}, false, 'simple').proUpsell).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').proUpsell).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').proUpsell).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').proUpsell).toBe(true)
  })
})

describe('isolateSelection flag (FEAT-C isolate/solo focus mode)', () => {
  it('is pro-tier, ships in prod, default on', () => {
    expect(FEATURE_FLAGS.isolateSelection.default).toBe(true)
    expect(FEATURE_FLAGS.isolateSelection.tier).toBe('pro')
    expect(FEATURE_FLAGS.isolateSelection.devOnly).toBeUndefined()
  })

  it('is hidden in Simple mode and present in Pro mode (both build kinds)', () => {
    expect(resolveFlags(false, {}, false, 'simple').isolateSelection).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').isolateSelection).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').isolateSelection).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').isolateSelection).toBe(true)
  })
})
