import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import { furnishPlanItems } from '../furnishPlan'
import { LAYOUT_PRESETS } from '../layoutPresets'
import type { FurnitureItem } from '../types'
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
    // Sofa surface props are dense but capped at the host ceiling (4); the
    // separate wall-art pass (RD408-008) adds one wall-mounted piece on top.
    const sofaSurface = sofaDecor.filter((d) => d.defId !== 'wall-art')
    expect(sofaSurface.length).toBeGreaterThanOrEqual(2)
    expect(sofaSurface.length).toBeLessThanOrEqual(4)
    expect(sofaDecor.filter((d) => d.defId === 'wall-art')).toHaveLength(1)
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
    // Shape/pattern are varied from valid option sets (silhouette/fabric mix).
    for (const c of cushions) {
      expect(['square', 'rect']).toContain(c.props.shape)
      expect(['plain', 'stripe']).toContain(c.props.pattern)
    }
    // Deterministic with the same seed.
    const again = applyDecorStyling([sofa], BUILTIN_CATALOG)
    expect(again.filter((d) => d.defId === 'throw-cushion').map((c) => c.props.color)).toEqual(
      cushions.map((c) => c.props.color),
    )
  })

  it('dresses the newly-added host surfaces (RD-408): tv-console, ottoman, bench', () => {
    for (const defId of ['tv-console', 'ottoman', 'bench'] as const) {
      const host = {
        id: `host-${defId}`,
        defId,
        position: [3, 3] as [number, number],
        rotation: 0,
        props: {},
      }
      const decor = applyDecorStyling([host], BUILTIN_CATALOG)
      expect(decor.length).toBeGreaterThanOrEqual(1)
      // Decor sits at the host's real top surface via `surfaceHeight` (the prop
      // self-lifts in local space). It must NOT also set `elevation`, or the prop
      // double-lifts to ~2× the surface height and floats.
      const top = BUILTIN_CATALOG[defId].defaultFootprint.h
      for (const d of decor) {
        expect(d.props.surfaceHeight).toBeCloseTo(top, 5)
        expect(d.elevation ?? 0).toBe(0)
      }
    }
  })

  it('leads with the trailing-plant hero prop on open shelving (RD-408)', () => {
    // The trailing plant is the top priority on the open shelving units, so it is
    // placed even at the minimum per-surface budget of 1.
    for (const defId of ['bookshelf', 'cube-shelf'] as const) {
      const host = {
        id: `host-${defId}`,
        defId,
        position: [4, 4] as [number, number],
        rotation: 0,
        props: {},
      }
      const decor = applyDecorStyling([host], BUILTIN_CATALOG)
      expect(decor.some((d) => d.defId === 'trailing-plant')).toBe(true)
      // The trailing plant must sit at the host top via surfaceHeight (self-lift),
      // never via elevation, exactly like the other tabletop decor props.
      const top = BUILTIN_CATALOG[defId].defaultFootprint.h
      for (const d of decor.filter((x) => x.defId === 'trailing-plant')) {
        expect(d.props.surfaceHeight).toBeCloseTo(top, 5)
        expect(d.elevation ?? 0).toBe(0)
      }
    }
  })

  it('offers the decor-tray hero prop on its host surfaces and self-lifts via surfaceHeight (RD-408)', () => {
    // The styled tray leads on the coffee-table and ottoman, so it appears even
    // at the minimum per-surface budget of 1; it is a secondary option on the
    // console-table / sideboard. Across the four wired hosts, at least one must
    // offer it, and wherever it lands it must sit at the host top via
    // `surfaceHeight` (self-lift) — never via `elevation`.
    let offeredSomewhere = false
    for (const defId of ['coffee-table', 'ottoman', 'console-table', 'sideboard'] as const) {
      const host = {
        id: `host-${defId}`,
        defId,
        position: [4, 4] as [number, number],
        rotation: 0,
        props: {},
      }
      const decor = applyDecorStyling([host], BUILTIN_CATALOG)
      const trays = decor.filter((d) => d.defId === 'decor-tray')
      if (trays.length > 0) offeredSomewhere = true
      const top = BUILTIN_CATALOG[defId].defaultFootprint.h
      for (const d of trays) {
        expect(d.props.surfaceHeight).toBeCloseTo(top, 5)
        expect(d.elevation ?? 0).toBe(0)
      }
    }
    expect(offeredSomewhere).toBe(true)
    // The coffee-table and ottoman lead with the tray, so it is guaranteed there.
    for (const defId of ['coffee-table', 'ottoman'] as const) {
      const host = {
        id: `lead-${defId}`,
        defId,
        position: [4, 4] as [number, number],
        rotation: 0,
        props: {},
      }
      const decor = applyDecorStyling([host], BUILTIN_CATALOG)
      expect(decor.some((d) => d.defId === 'decor-tray')).toBe(true)
    }
  })

  it('hangs one wall-art piece on the wall behind a sofa, facing the room (RD408-008)', () => {
    const sofa = {
      id: 'host-sofa',
      defId: 'sofa-3seat' as const,
      position: [2, 2] as [number, number],
      rotation: 0, // faces +Z → wall is behind at -Z
      props: {},
    }
    const decor = applyDecorStyling([sofa], BUILTIN_CATALOG)
    const art = decor.filter((d) => d.defId === 'wall-art')
    expect(art).toHaveLength(1)
    const a = art[0]
    // Faces the same way as the host (into the room).
    expect(a.rotation).toBe(0)
    // Sits on the wall BEHIND the host (−Z of a +Z-facing sofa), so its z is less
    // than the host centre by ~half the host depth.
    expect(a.position[1]).toBeLessThan(sofa.position[1])
    expect(a.position[0]).toBeCloseTo(2, 5)
    // Mounted (self-lifts via mountHeight) — no floor elevation.
    expect(a.elevation ?? 0).toBe(0)
    expect(typeof a.props.mountHeight).toBe('number')
    expect(a.props.width).toBeGreaterThan(0)
  })

  it('does NOT hang wall-art on hosts that are not wall-flushed (e.g. coffee-table)', () => {
    const table = {
      id: 'host-coffee',
      defId: 'coffee-table' as const,
      position: [3, 3] as [number, number],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([table], BUILTIN_CATALOG)
    expect(decor.some((d) => d.defId === 'wall-art')).toBe(false)
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
    // Surface props are capped at HOST_MAX['sofa-3seat']; the wall-art pass adds
    // one separate wall-mounted piece (RD408-008).
    expect(decor.filter((d) => d.defId !== 'wall-art').length).toBeLessThanOrEqual(4)
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
    // Surface props self-lift to the host top; the wall-art piece is
    // wall-mounted (lifts via mountHeight, no surfaceHeight) so it's excluded.
    const surfaceProps = decor.filter((d) => d.defId !== 'wall-art')
    expect(surfaceProps.length).toBeGreaterThan(0)
    for (const d of surfaceProps) {
      // surfaceHeight should equal the sofa's defaultFootprint.h; the prop
      // self-lifts to it. `elevation` must stay unset, or the prop double-lifts.
      expect(d.props.surfaceHeight).toBeCloseTo(sofa!.defaultFootprint.h, 2)
      expect(d.elevation ?? 0).toBe(0)
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

  it('styles rooms on UPPER storeys too, tagged with the level (AUD-001/F13)', () => {
    // Regression: `applyDecorStylingForPlan` used to iterate ground-only
    // `plan.rooms`, so an upper-storey room's hosts produced NO decor (and any
    // decor it did make would have rendered on the ground floor — decor items
    // carry no `levelId` of their own).
    const ground = makePlan()
    // A 2-storey plan: a loft directly above the ground living room (same x/z).
    const plan: FloorPlan = {
      ...ground,
      upperLevels: [
        {
          id: 'upper',
          name: 'Loft',
          elevation: 3,
          walls: ground.walls,
          openings: [],
          rooms: [{ id: 'loft', name: 'Loft', origin: [0.2, 0.2], width: 5.0, depth: 7.6 }],
        },
      ],
    }
    // One host on the GROUND living room and an identical one on the UPPER loft
    // (same x/z — only `levelId` distinguishes them).
    const host = (id: string, levelId?: string): FurnitureItem => ({
      id,
      defId: 'coffee-table' as FurnitureItem['defId'],
      position: [2.5, 3.5],
      rotation: 0,
      props: {},
      ...(levelId ? { levelId } : {}),
    })
    const arranged: FurnitureItem[] = [host('g-table'), host('u-table', 'upper')]
    const decor = applyDecorStylingForPlan(plan, arranged, BUILTIN_CATALOG)
    // Decor produced for BOTH storeys' hosts.
    const groundDecor = decor.filter((d) => d.id.includes('g-table'))
    const upperDecor = decor.filter((d) => d.id.includes('u-table'))
    expect(groundDecor.length).toBeGreaterThan(0)
    expect(upperDecor.length).toBeGreaterThan(0)
    // Upper decor is tagged onto the loft storey; ground decor stays untagged.
    expect(upperDecor.every((d) => d.levelId === 'upper')).toBe(true)
    expect(groundDecor.every((d) => d.levelId === undefined)).toBe(true)
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
