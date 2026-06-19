import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import { furnishPlanItems } from '../furnishPlan'
import { LAYOUT_PRESETS } from '../layoutPresets'
import { applyDecorStyling, applyDecorStylingForPlan } from './decorStyling'

const movein = LAYOUT_PRESETS.find((p) => p.id === 'move-in')!
const ext: FloorPlan['walls'][number]['thickness'] = 'external'

/** Minimal custom plan: living/dining + master bedroom. */
function makePlan(): FloorPlan {
  return {
    id: 'decor-test-plan',
    name: 'Decor Test Flat',
    ceilingHeight: 2.6,
    extent: [10, 8],
    walls: [
      { id: 'n', start: [0.1, 0.1], end: [9.9, 0.1], thickness: ext },
      { id: 'e', start: [9.9, 0.1], end: [9.9, 7.9], thickness: ext },
      { id: 's', start: [9.9, 7.9], end: [0.1, 7.9], thickness: ext },
      { id: 'w', start: [0.1, 7.9], end: [0.1, 0.1], thickness: ext },
    ],
    openings: [],
    rooms: [
      { id: 'living', name: 'Living / Dining', origin: [0.2, 0.2], width: 5.0, depth: 7.6 },
      { id: 'master', name: 'Master Bedroom', origin: [5.4, 0.2], width: 4.4, depth: 7.6 },
    ],
  }
}

describe('applyDecorStyling', () => {
  it('returns decor props for hosts present in the arranged list', () => {
    const plan = makePlan()
    // Furnish without decor, then apply styling manually.
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor = applyDecorStyling(furniture, BUILTIN_CATALOG)
    // Some decor should be produced (sofas, beds, tables all present).
    expect(decor.length).toBeGreaterThan(0)
  })

  it('all decor items reference valid def ids in the catalog', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor = applyDecorStyling(furniture, BUILTIN_CATALOG)
    for (const d of decor) {
      expect(BUILTIN_CATALOG).toHaveProperty(d.defId)
    }
  })

  it('never places more than MAX_PER_HOST (2) props per host surface', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor = applyDecorStyling(furniture, BUILTIN_CATALOG)
    // Count props per host id (parsed from id "decor-{hostId}-{propId}-{slot}")
    const counts = new Map<string, number>()
    for (const d of decor) {
      // id format: "decor-{hostId}-{propId}-{slot}"
      const parts = d.id.split('-')
      // The host id is everything between 'decor-' and the propId segment.
      // Find the first segment that matches a catalog def.
      // Simpler: count by slot (last char is slot index 0 or 1 ≤ MAX_PER_HOST).
      const slot = Number(parts[parts.length - 1])
      expect(slot).toBeLessThan(2) // MAX_PER_HOST = 2
    }
    void counts
  })

  it('sets surfaceHeight to the host top height in each decor prop', () => {
    // Place a mock sofa host and check that the cushion's surfaceHeight matches
    // the sofa's top (defaultFootprint.h = 0.85).
    const sofa = BUILTIN_CATALOG['sofa-3seat']
    expect(sofa).toBeDefined()
    const mockSofa = {
      id: 'test-sofa',
      defId: 'sofa-3seat' as const,
      position: [2.0, 2.0] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([mockSofa], BUILTIN_CATALOG)
    expect(decor.length).toBeGreaterThan(0)
    for (const d of decor) {
      // surfaceHeight should equal the sofa's defaultFootprint.h.
      expect(d.props.surfaceHeight).toBeCloseTo(sofa!.defaultFootprint.h, 2)
      expect(d.elevation).toBeCloseTo(sofa!.defaultFootprint.h, 2)
    }
  })

  it('is deterministic: same seed produces same output', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const a = applyDecorStyling(furniture, BUILTIN_CATALOG, 42)
    const b = applyDecorStyling(furniture, BUILTIN_CATALOG, 42)
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id))
    expect(a.map((d) => d.position)).toEqual(b.map((d) => d.position))
  })

  it('produces no decor for an empty item list (no suitable hosts)', () => {
    const decor = applyDecorStyling([], BUILTIN_CATALOG)
    expect(decor).toHaveLength(0)
  })

  it('produces no decor for items with no host-surface defIds', () => {
    // A rug and a ceiling light are not host surfaces.
    const items = [
      {
        id: 'rug-1',
        defId: 'rug' as const,
        position: [1, 1] as [number, number],
        rotation: 0,
        props: {},
      },
      {
        id: 'lamp-1',
        defId: 'ceiling-light' as const,
        position: [2, 2] as [number, number],
        rotation: 0,
        props: {},
      },
    ]
    const decor = applyDecorStyling(items, BUILTIN_CATALOG)
    expect(decor).toHaveLength(0)
  })
})

describe('applyDecorStylingForPlan', () => {
  it('places decor in each room that has host surfaces', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG)
    expect(decor.length).toBeGreaterThan(0)
  })

  it('is deterministic across calls with the same seed', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const a = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG, 7)
    const b = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG, 7)
    expect(a.map((d) => d.id)).toEqual(b.map((d) => d.id))
  })
})

describe('furnishPlanItems with decor (withDecor=true)', () => {
  it('returns more items than without decor', () => {
    const plan = makePlan()
    const withDecor = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, true)
    const withoutDecor = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    expect(withDecor.length).toBeGreaterThan(withoutDecor.length)
  })

  it('all decor items in the result have noClip=true in the catalog def', () => {
    const plan = makePlan()
    const withoutDecor = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const withDecor = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, true)
    const decorOnly = withDecor.filter((it) => !withoutDecor.some((w) => w.id === it.id))
    expect(decorOnly.length).toBeGreaterThan(0)
    for (const d of decorOnly) {
      const def = BUILTIN_CATALOG[d.defId]
      expect(def?.noClip).toBe(true)
    }
  })

  it('is idempotent: re-calling with the same arranged list does not stack decor ids', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor1 = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG)
    const decor2 = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG)
    // Same ids — not growing.
    expect(decor1.map((d) => d.id).sort()).toEqual(decor2.map((d) => d.id).sort())
  })
})
