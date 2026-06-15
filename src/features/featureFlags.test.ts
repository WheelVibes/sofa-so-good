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
    // Multi-axis tilt is an advanced placement control → pro tier.
    expect(resolveFlags(true, {}, false, 'simple').tiltFurniture).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').tiltFurniture).toBe(true)
  })

  it('catalogModelInfo (pro tier) is hidden in Simple mode and present in Pro mode', () => {
    expect(resolveFlags(true, {}, false, 'simple').catalogModelInfo).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').catalogModelInfo).toBe(true)
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

  it('panoTour (simple tier, prod default on) is present in BOTH Simple and Pro', () => {
    // Both modes, both build kinds — the linked 360° tour is a simple feature.
    expect(resolveFlags(false, {}, false, 'simple').panoTour).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').panoTour).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').panoTour).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').panoTour).toBe(true)
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

  it('Simple mode wins over a dev override (pro stays hidden)', () => {
    const simple = resolveFlags(true, { drawings: true }, false, 'simple')
    expect(simple.drawings).toBe(false)
  })

  it('defaults to Pro when no mode is passed (non-store callers see everything)', () => {
    expect(resolveFlags(true, {}).drawings).toBe(true)
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
  it('is simple-tier: present in both Simple and Pro by default', () => {
    expect(resolveFlags(false, {}, false, 'simple').panorama).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').panorama).toBe(true)
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
