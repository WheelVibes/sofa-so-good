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
    expect(pro.measure).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').measure).toBe(false)
    // Simple features are unaffected by the mode.
    expect(pro.smartStart).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').smartStart).toBe(true)
  })

  it('shopExport (simple tier, prod default on) is available in BOTH Simple and Pro modes', () => {
    // Production build, no overrides — the shoppable buy-list ships in prod…
    expect(resolveFlags(false, {}, false, 'simple').shopExport).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').shopExport).toBe(true)
    // …while the brand-link gate (ikeaLive, devOnly) stays off in prod.
    expect(resolveFlags(false, {}, false, 'pro').ikeaLive).toBe(false)
  })

  it('finishDnd (simple tier, prod default on) is available in BOTH Simple and Pro modes', () => {
    // Drag-to-apply finishes is part of the core "finish" loop, so a production
    // build keeps it on in the default Simple mode as well as in Pro.
    expect(resolveFlags(false, {}, false, 'simple').finishDnd).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').finishDnd).toBe(true)
  })

  it('panoTour (pro tier, prod default on) is hidden in Simple and present in Pro', () => {
    // Both modes, both build kinds — the linked 360° tour is a pro feature.
    expect(resolveFlags(false, {}, false, 'simple').panoTour).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').panoTour).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').panoTour).toBe(false)
    expect(resolveFlags(true, {}, false, 'pro').panoTour).toBe(true)
    // Tiered consistently with the single-shot panorama it builds on.
    expect(FEATURE_FLAGS.panoTour.tier).toBe(FEATURE_FLAGS.panorama.tier)
  })

  it('Simple mode wins over a dev override (pro stays hidden)', () => {
    const simple = resolveFlags(true, { measure: true }, false, 'simple')
    expect(simple.measure).toBe(false)
  })

  it('defaults to Pro when no mode is passed (non-store callers see everything)', () => {
    expect(resolveFlags(true, {}).measure).toBe(true)
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
  it('is enabled in BOTH Simple and Pro modes by default (simple-tier)', () => {
    expect(resolveFlags(false, {}, false, 'simple').textBrief).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').textBrief).toBe(true)
  })
  it('can still be turned off by a privileged (dev/admin) override', () => {
    expect(resolveFlags(true, { textBrief: false }, false, 'pro').textBrief).toBe(false)
  })
})

describe('panorama flag (360° capture)', () => {
  it('is pro-tier: hidden in Simple, present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').panorama).toBe(false)
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

describe('hqRender flag (F1)', () => {
  it('is pro-tier: hidden in Simple, present in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').hqRender).toBe(false)
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
  it('is pro-tier: hidden in Simple, present in Pro (prod default on)', () => {
    expect(resolveFlags(false, {}, false, 'simple').parametricFurniture).toBe(false)
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
