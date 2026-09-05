import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/flags/resolve'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { GENERATED_FURNITURE } from './generatedCatalog'
import {
  DEFAULT_TOLERANCE,
  heightFitScale,
  MAX_HEIGHT_STRETCH,
  PHOTOREAL_PROXIES,
  photorealProxyFor,
  proxyScale,
} from './photorealProxies'

const heroIds = new Set(GENERATED_FURNITURE.map((d) => d.id))

describe('PHOTOREAL_PROXIES table', () => {
  it('every mapped parametric def exists and is parametric', () => {
    for (const defId of Object.keys(PHOTOREAL_PROXIES)) {
      const def = BUILTIN_CATALOG[defId]
      expect(def, `unknown def ${defId}`).toBeTruthy()
      expect(def?.kind, `${defId} must be parametric`).toBe('parametric')
    }
  })

  it('every hero GLB id is a bundled builtin in the generated catalog', () => {
    for (const [defId, spec] of Object.entries(PHOTOREAL_PROXIES)) {
      expect(heroIds.has(spec.glbId), `${defId} → ${spec.glbId} not in GENERATED_FURNITURE`).toBe(
        true,
      )
      const hero = GENERATED_FURNITURE.find((d) => d.id === spec.glbId)
      expect(hero?.kind).toBe('gltf')
      expect(hero && 'source' in hero && hero.source).toBe('builtin')
      expect(hero && 'license' in hero ? hero.license : undefined).toBe('CC0')
    }
  })

  it('hero footprints are plausible furniture sizes (the sidecar was measured, not guessed)', () => {
    for (const spec of new Set(Object.values(PHOTOREAL_PROXIES).map((s) => s.glbId))) {
      const hero = GENERATED_FURNITURE.find((d) => d.id === spec)
      const fp = hero?.defaultFootprint
      expect(fp).toBeTruthy()
      if (!fp) continue
      expect(fp.w).toBeGreaterThan(0.3)
      expect(fp.w).toBeLessThan(3)
      expect(fp.h).toBeGreaterThan(0.3)
      expect(fp.h).toBeLessThan(2.2)
    }
  })
})

describe('proxyScale', () => {
  it('matches width when depth and height fit', () => {
    // sofa_02 1.807×0.818×0.709 into the 3-seat footprint 2.1×0.9×0.85
    const s = proxyScale({ w: 1.807, d: 0.818, h: 0.709 }, { w: 2.1, d: 0.9, h: 0.85 })
    expect(s).toBeCloseTo(2.1 / 1.807, 5)
    expect(0.818 * s).toBeLessThanOrEqual(0.9 * (1 + DEFAULT_TOLERANCE))
  })

  it('clamps on depth when a width match would overflow the footprint', () => {
    // dining_chair_02 0.434×0.576×0.973 into 0.46×0.48×0.92 — width match (1.06) puts the
    // depth at 0.61, past even a 20 % tolerance; the clamp wins.
    const chairGlb = { w: 0.434, d: 0.576, h: 0.973 }
    const s = proxyScale(chairGlb, { w: 0.46, d: 0.48, h: 0.92 }, 0.2)
    expect(s).toBeCloseTo((0.48 * 1.2) / chairGlb.d, 5)
    expect(chairGlb.w * s).toBeLessThan(0.46)
  })

  it('clamps on height for a tall piece in a short footprint', () => {
    const s = proxyScale({ w: 1.0, d: 0.3, h: 2.0 }, { w: 1.0, d: 0.3, h: 1.0 })
    expect(s).toBeCloseTo(1.15 / 2.0, 5)
  })
})

describe('photorealProxyFor', () => {
  const sofa = BUILTIN_CATALOG['sofa-3seat']
  const chair = BUILTIN_CATALOG['dining-chair']
  const bed = BUILTIN_CATALOG['bed-queen']

  it('returns null when disabled, for unmapped defs, and for GLB defs', () => {
    expect(photorealProxyFor(sofa, {}, false)).toBeNull()
    expect(photorealProxyFor(bed, {}, true)).toBeNull()
    const hero = GENERATED_FURNITURE.find((d) => d.id === 'ph-sofa-leather')
    expect(hero && photorealProxyFor(hero, {}, true)).toBeNull()
  })

  it('resolves the sofa to its hero GLB at a width-matched scale', () => {
    const p = photorealProxyFor(sofa, {}, true)
    expect(p?.def.id).toBe('ph-sofa-leather')
    expect(p?.url).toContain('ph-sofa-leather.glb')
    expect(p?.scale).toBeCloseTo(2.1 / p!.def.defaultFootprint.w, 5)
  })

  it('follows the live width param, bounded by the footprint tolerance', () => {
    const narrow = photorealProxyFor(sofa, { width: 1.8 }, true)!
    const wide = photorealProxyFor(sofa, { width: 2.4 }, true)!
    expect(narrow.scale).toBeLessThan(wide.scale)
    const fp = wide.def.defaultFootprint
    // Depth never exceeds the parametric depth (0.9) by more than the tolerance.
    expect(fp.d * wide.scale).toBeLessThanOrEqual(0.9 * (1 + DEFAULT_TOLERANCE) + 1e-9)
  })

  it('never lets a proxy exceed its collision footprint width', () => {
    for (const defId of Object.keys(PHOTOREAL_PROXIES)) {
      const def = BUILTIN_CATALOG[defId]
      const p = photorealProxyFor(def, {}, true)
      expect(p, defId).toBeTruthy()
      if (!p) continue
      expect(p.def.defaultFootprint.w * p.scale).toBeLessThanOrEqual(def.defaultFootprint.w + 1e-9)
      expect(p.scale).toBeGreaterThan(0.5)
      expect(p.scale).toBeLessThan(1.6)
    }
    // the chair uses its own, looser tolerance
    expect(photorealProxyFor(chair, {}, true)?.scale).toBeGreaterThan(0.9)
  })
})

describe('fitHeight — surface hosts put their top at the parametric height', () => {
  it('coffee table: decor at surfaceHeight 0.42 must sit ON the stone top', () => {
    const table = BUILTIN_CATALOG['coffee-table']
    const p = photorealProxyFor(table, {}, true)!
    const top = p.def.defaultFootprint.h * p.scale3[1]
    expect(top).toBeCloseTo(table.defaultFootprint.h, 3)
    expect(p.scale3[0]).toBe(p.scale)
    expect(p.scale3[2]).toBe(p.scale)
    // and the stretch stays inside the visual bound
    expect(p.scale3[1] / p.scale).toBeLessThanOrEqual(MAX_HEIGHT_STRETCH)
    expect(p.scale3[1] / p.scale).toBeGreaterThanOrEqual(1 / MAX_HEIGHT_STRETCH)
  })

  it('every fitHeight host lands its top within 1 mm of the parametric height', () => {
    for (const [defId, spec] of Object.entries(PHOTOREAL_PROXIES)) {
      if (!spec.fitHeight) continue
      const def = BUILTIN_CATALOG[defId]
      const p = photorealProxyFor(def, {}, true)!
      expect(p.def.defaultFootprint.h * p.scale3[1], defId).toBeCloseTo(def.defaultFootprint.h, 3)
    }
  })

  it('a non-fitHeight piece is uniformly scaled', () => {
    const p = photorealProxyFor(BUILTIN_CATALOG['sofa-3seat'], {}, true)!
    expect(p.scale3).toEqual([p.scale, p.scale, p.scale])
  })

  it('heightFitScale clamps an absurd stretch to the bound', () => {
    expect(heightFitScale(1, 0.5, 2.0)).toBeCloseTo(MAX_HEIGHT_STRETCH, 6)
    expect(heightFitScale(1, 2.0, 0.5)).toBeCloseTo(1 / MAX_HEIGHT_STRETCH, 6)
    expect(heightFitScale(0.9, 0.39, 0.42)).toBeCloseTo(0.42 / 0.39, 6)
  })
})

describe('photorealModels flag', () => {
  it('ships ON in both Simple and Pro modes (simple tier, prod-safe CC0)', () => {
    expect(resolveFlags(false, {}, false, 'simple').photorealModels).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').photorealModels).toBe(true)
  })
})
