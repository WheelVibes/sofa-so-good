/**
 * Guards on AUTHORED-DATA coverage — the failure mode v0.31.5.288 found.
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
