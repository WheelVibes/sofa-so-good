/**
 * Guards on AUTHORED-DATA coverage — the failure mode v0.31.5.389 found.
 *
 * The tile setting-out table rendered empty from the day it shipped, because
 * `planTileCoursing` reads FLOOR finishes and no floor material carried a
 * `moduleMm`. Code finished, tests green, feature silently inert — "no rows" is
 * a legitimate state, so nothing failed.
 *
 * These are not style rules; each one pins a fact a feature DEPENDS on, in both
 * directions. A drop to zero means a feature has quietly stopped working; a rise
 * means someone authored data and should have read
 * `docs/research/2026-09-03-authored-data-coverage.md` first — particularly for
 * `PlanWall.structure`, where seeding unverified values on shipped plans is the
 * one direction of error that feature must never make.
 */
import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from './floorplan/templates'
import { LIGHT_EMITTERS, OVERRIDE_EMITTER } from './furniture/lightEmitters'
import { BUILTIN_MATERIALS } from './materials/builtinCatalog'

describe('modular finishes carry a specified module', () => {
  const mats = Object.values(BUILTIN_MATERIALS)

  it('every porcelain/vinyl FLOOR the coursing feature needs has a module', () => {
    // The four porcelain floors + the vinyl plank, seeded in .288 from cited SG
    // formats. If one loses its module, its rooms drop silently out of the
    // setting-out table and the tiling layout plan.
    const needModule = [
      'floor-tile-white',
      'floor-tile-grey',
      'floor-tile-charcoal',
      'floor-tile-sand',
      'floor-vinyl-light',
    ]
    for (const id of needModule) {
      const m = BUILTIN_MATERIALS[id]
      expect(m, `${id} missing from the catalog`).toBeTruthy()
      expect(m?.moduleMm, `${id} lost its specified module`).toBeTruthy()
    }
  })

  it('leaves NON-modular finishes without one, rather than inventing a dimension', () => {
    // A fabricated module on a contractor's drawing is worse than an
    // acknowledged gap. Hex is the sharpest case: the coursing model is
    // rectangular, so a hex "module" would be silently WRONG, not imprecise.
    for (const id of [
      'floor-tile-hex',
      'floor-tile-hex-charcoal',
      'floor-concrete',
      'floor-screed',
      'floor-carpet-grey',
      'floor-tile-marble',
    ]) {
      expect(BUILTIN_MATERIALS[id]?.moduleMm, `${id} gained an invented module`).toBeUndefined()
    }
  })

  it('at least one floor finish is modular at all — the .288 regression', () => {
    // The bare "is the feature alive" check. Zero here means the tile
    // setting-out table and the tiling layout plan produce nothing.
    expect(mats.filter((m) => m.category === 'floor' && m.moduleMm).length).toBeGreaterThan(0)
  })
})

describe('template wall structure is unauthored, deliberately', () => {
  it('no shipped template declares a wall structure', () => {
    // 0/225 as measured. `structure` is USER-DECLARED, NEVER VERIFIED: the app
    // cannot tell a load-bearing wall from a partition from geometry, and the
    // 19 templates are plausible reference layouts, not surveyed drawings. The
    // curated default flat is seeded ONLY because its wall types were traced
    // from the official plan legend.
    //
    // If this test fails because someone seeded values, that is a CONTENT +
    // SAFETY decision, not a bug fix: read
    // `docs/research/2026-09-03-authored-data-coverage.md` (Finding B) first.
    // Seeding external walls alone is the tempting option and is called out
    // there as the worst outcome unless the overlay legend changes with it,
    // because a partially classified plan makes "unknown" read as "checked and
    // not structural".
    const offenders: string[] = []
    for (const t of PLAN_TEMPLATES) {
      for (const level of [t, ...(t.upperLevels ?? [])]) {
        for (const w of level.walls ?? []) {
          if (w.structure) offenders.push(`${t.id}:${w.id}=${w.structure}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the curated default flat DOES declare structure — traced, not guessed', () => {
    // The counterpart: the one plan with a real source keeps its classification,
    // so this pair documents the distinction rather than banning the field.
    return import('./floorplan/defaultPlan').then(({ buildDefaultPlan }) => {
      const declared = buildDefaultPlan().walls.filter((w) => w.structure)
      expect(declared.length).toBeGreaterThan(0)
    })
  })
})

/**
 * Lamp specification, guarded by ENUMERATION rather than by remembering.
 *
 * Two lessons converge here, both learned the hard way in this arc:
 *
 * **1. A regex over source is a sample, not an enumeration, and its coverage is
 * invisible in the result.** v0.31.5.397 reported "0 of 6 emitters carry a lamp
 * spec". There are EIGHT — `vanity` and `aquarium` use unquoted keys the pattern
 * skipped — and lumens were already derived, so both the numerator and the
 * denominator were wrong from one bad pattern. The wrong denominator is what
 * made the wrong numerator look plausible. These tests import the registry, so
 * a ninth emitter is counted whether or not anyone remembers it exists.
 *
 * **2. A prohibition lives in memory; a structure fails the suite.** `cct`/`ip`
 * being required on `EmitterSpec` already makes TypeScript catch a new emitter
 * with no spec. What types CANNOT catch is a value that compiles but
 * contradicts the fixture — which is exactly what happened: a bulk edit
 * authored 3000 K warm white onto the aquarium, whose own comment two lines up
 * calls it "a cool aqua accent". Review caught it; nothing automated would
 * have. So the semantic intent is pinned below.
 */
describe('every light emitter carries a coherent lamp spec', () => {
  const emitters = Object.entries(LIGHT_EMITTERS).filter(([, v]) => v)

  it('enumerates the registry rather than trusting a remembered count', () => {
    // The specific number matters less than the fact this is derived. If an
    // emitter is added, the assertions below cover it automatically; this line
    // just makes a silent registry SHRINK visible too.
    expect(emitters.length).toBeGreaterThanOrEqual(8)
  })

  it('offers every authored CCT in the inspector control', () => {
    // A value the inspector cannot represent would be unreachable to edit and
    // would silently snap to something else on the first change.
    const OFFERED = new Set([2700, 3000, 4000, 6500])
    for (const [id, spec] of emitters) {
      expect(OFFERED.has(spec!.cct), `${id} has CCT ${spec!.cct}, not an offered option`).toBe(true)
    }
    expect(OFFERED.has(OVERRIDE_EMITTER.cct)).toBe(true)
  })

  it('offers every authored IP rating in the inspector control', () => {
    const OFFERED = new Set([20, 44, 65])
    for (const [id, spec] of emitters) {
      expect(OFFERED.has(spec!.ip), `${id} has IP${spec!.ip}, not an offered option`).toBe(true)
    }
    expect(OFFERED.has(OVERRIDE_EMITTER.ip)).toBe(true)
  })

  it('keeps the aquarium COOL — the one fixture a bulk edit got wrong', () => {
    // Its render tint is `#bfe8f2` and its comment says "cool aqua accent".
    // A uniform warm-white value compiled fine and contradicted both.
    expect(LIGHT_EMITTERS.aquarium?.cct).toBeGreaterThan(5000)
  })

  it('keeps every OTHER shipped fixture warm — residential, not office', () => {
    // The counterpart assertion, so "all cool" would fail too. Without it, the
    // aquarium test above passes on a registry that has drifted entirely cool.
    for (const [id, spec] of emitters) {
      if (id === 'aquarium') continue
      expect(spec!.cct, `${id} is not warm white`).toBeLessThanOrEqual(3000)
    }
  })
})
