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

  it('density budget scales with host footprint area (RD408-001)', () => {
    // A 3-seat sofa (≈1.89 m²) should get strictly more props than a tiny
    // side table (≈0.20 m²) — budget scales with area, clamped per type.
    const sofa = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
    }
    const sideTable = {
      id: 'host-side',
      defId: 'side-table' as const,
      position: [6, 6] as [number, number],
      rotation: 0,
      props: {},
    }
    const sofaDecor = applyDecorStyling([sofa], BUILTIN_CATALOG)
    const sideDecor = applyDecorStyling([sideTable], BUILTIN_CATALOG)
    expect(sofaDecor.length).toBeGreaterThan(sideDecor.length)
    // Side table has a strict ceiling of 1.
    expect(sideDecor.length).toBe(1)
    // Sofa is dense but capped at its host ceiling (4).
    expect(sofaDecor.length).toBeGreaterThanOrEqual(2)
    expect(sofaDecor.length).toBeLessThanOrEqual(4)
  })

  it('varies the colour of repeated soft-good props so they are not clones (RD-408)', () => {
    // A 3-seat sofa gets multiple cushions; their fabric colour must vary.
    const sofa = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([sofa], BUILTIN_CATALOG)
    const cushions = decor.filter((d) => d.defId === 'throw-cushion')
    expect(cushions.length).toBeGreaterThanOrEqual(2)
    const colours = new Set(cushions.map((c) => c.props.color))
    expect(colours.size).toBeGreaterThanOrEqual(2) // not identical clones
    // Deterministic with the same seed.
    const again = applyDecorStyling([sofa], BUILTIN_CATALOG)
    expect(again.filter((d) => d.defId === 'throw-cushion').map((c) => c.props.color)).toEqual(
      cushions.map((c) => c.props.color),
    )
  })

  it('respects the per-host-type ceiling even for huge hosts (RD408-001)', () => {
    // Per-type ceilings cap density regardless of how large a surface is.
    const sofa = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([sofa], BUILTIN_CATALOG)
    expect(decor.length).toBeLessThanOrEqual(4) // HOST_MAX['sofa-3seat']
  })

  it('always dresses a tiny (but ≥ min-area) host with at least one prop', () => {
    const nightstand = {
      id: 'host-ns',
      defId: 'nightstand' as const,
      position: [1, 1] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([nightstand], BUILTIN_CATALOG)
    expect(decor.length).toBeGreaterThanOrEqual(1)
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

  it('spreads multiple props across the host footprint without overlap (RD408-002)', () => {
    // A king bed gets several cushions; their positions must be distinct and
    // each must sit within the host footprint (props are noClip but should not
    // visually spill off the surface).
    const bed = BUILTIN_CATALOG['bed-king']!
    const host = {
      id: 'host-bed',
      defId: 'bed-king' as const,
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([host], BUILTIN_CATALOG)
    expect(decor.length).toBeGreaterThan(1)
    const halfW = bed.defaultFootprint.w / 2
    const halfD = bed.defaultFootprint.d / 2
    for (const d of decor) {
      expect(Math.abs(d.position[0] - 3)).toBeLessThanOrEqual(halfW + 1e-6)
      expect(Math.abs(d.position[1] - 3)).toBeLessThanOrEqual(halfD + 1e-6)
    }
    // No two props share an identical position.
    const keys = decor.map((d) => `${d.position[0].toFixed(4)},${d.position[1].toFixed(4)}`)
    expect(new Set(keys).size).toBe(keys.length)
    // Props don't all collapse to the host centre (some real spread exists).
    const spread = decor.some(
      (d) => Math.abs(d.position[0] - 3) > 0.05 || Math.abs(d.position[1] - 3) > 0.05,
    )
    expect(spread).toBe(true)
  })

  it('spread is rotation-aware: offsets follow the host yaw (RD408-002)', () => {
    // Same host, rotated 90°: the long-axis spread should now run along Z, not X.
    const base = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const rotated = { ...base, rotation: Math.PI / 2 }
    const a = applyDecorStyling([base], BUILTIN_CATALOG, 5)
    const b = applyDecorStyling([rotated], BUILTIN_CATALOG, 5)
    const rangeX = (items: typeof a) => {
      const xs = items.map((d) => d.position[0])
      return Math.max(...xs) - Math.min(...xs)
    }
    const rangeZ = (items: typeof a) => {
      const zs = items.map((d) => d.position[1])
      return Math.max(...zs) - Math.min(...zs)
    }
    // Unrotated: wider on X (long axis is w). Rotated 90°: that run swings to Z.
    expect(rangeX(a)).toBeGreaterThan(rangeZ(a))
    expect(rangeZ(b)).toBeGreaterThan(rangeX(b))
  })

  it('applies a bounded, non-zero, seeded rotation jitter (RD408-003)', () => {
    const sofa = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [2, 2] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([sofa], BUILTIN_CATALOG)
    // At least one prop is rotated off-square.
    expect(decor.some((d) => Math.abs(d.rotation) > 1e-6)).toBe(true)
    // Jitter stays bounded (well under ±45°) around the host facing.
    for (const d of decor) {
      expect(Math.abs(d.rotation)).toBeLessThan(0.8)
    }
  })

  it('rotation jitter is deterministic for a fixed seed (RD408-003)', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const a = applyDecorStyling(furniture, BUILTIN_CATALOG, 9)
    const b = applyDecorStyling(furniture, BUILTIN_CATALOG, 9)
    expect(a.map((d) => d.rotation)).toEqual(b.map((d) => d.rotation))
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
    expect(a.map((d) => d.position)).toEqual(b.map((d) => d.position))
    expect(a.map((d) => d.rotation)).toEqual(b.map((d) => d.rotation))
  })

  it('caps decor per room at ROOM_DECOR_CAP (10) (RD408-001)', () => {
    const plan = makePlan()
    const furniture = furnishPlanItems(plan, movein, BUILTIN_CATALOG, {}, false)
    const decor = applyDecorStylingForPlan(plan, furniture, BUILTIN_CATALOG)
    // Tally decor per room via the plan room boundaries.
    for (const room of plan.rooms) {
      const inRoom = decor.filter((d) => {
        const { origin, width, depth } = room
        return (
          d.position[0] >= origin[0] &&
          d.position[0] <= origin[0] + width &&
          d.position[1] >= origin[1] &&
          d.position[1] <= origin[1] + depth
        )
      })
      expect(inRoom.length).toBeLessThanOrEqual(10)
    }
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
