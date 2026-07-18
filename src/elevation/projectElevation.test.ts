import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { BuiltinGltfDef, FurnitureItem, ParametricDef } from '../furniture/types'
import { itemMountHeight, projectAllElevations, projectWallElevation } from './projectElevation'

const wallPlan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 't',
  name: 'T',
  ceilingHeight: 2.8,
  extent: [4, 4],
  walls: [{ id: 'w1', start: [0, 0], end: [4, 0], thickness: 'internal' }],
  openings: [
    { id: 'win1', kind: 'window', wallId: 'w1', offset: 1, width: 1.2, sill: 0.9, head: 2.1 },
  ],
  rooms: [],
  ...overrides,
})

const cabinet: BuiltinGltfDef = {
  id: 'cab',
  name: 'Cabinet',
  category: 'storage',
  kind: 'gltf',
  source: 'builtin',
  url: '/x.glb',
  license: 'CC0',
  defaultFootprint: { w: 1, d: 0.5, h: 2.0 },
}
const defs = { cab: cabinet }
const place = (cx: number, cz: number): FurnitureItem => ({
  id: `i-${cx}-${cz}`,
  defId: 'cab',
  position: [cx, cz],
  rotation: 0,
  props: {},
})

describe('projectWallElevation', () => {
  it('reports the wall extent + ceiling height and places openings by offset/width/sill/head', () => {
    const el = projectWallElevation(wallPlan(), wallPlan().walls[0]!, [], defs)
    expect(el.length).toBeCloseTo(4)
    expect(el.height).toBeCloseTo(2.8) // no topHeight → ceiling
    expect(el.openings).toHaveLength(1)
    expect(el.openings[0]).toEqual({ kind: 'window', x0: 1, x1: 2.2, sill: 0.9, head: 2.1 })
  })

  it('honours a wall topHeight cap over the ceiling height', () => {
    const plan = wallPlan()
    plan.walls[0]!.topHeight = 1.2
    expect(projectWallElevation(plan, plan.walls[0]!, [], defs).height).toBeCloseTo(1.2)
  })

  it('projects a flush piece onto the wall axis with its height', () => {
    const plan = wallPlan()
    // d=0.5 centred at z=0.25 → near face on the wall line; w=1 centred at x=2.
    const el = projectWallElevation(plan, plan.walls[0]!, [place(2, 0.25)], defs)
    expect(el.items).toHaveLength(1)
    const it = el.items[0]!
    expect(it.x0).toBeCloseTo(1.5)
    expect(it.x1).toBeCloseTo(2.5)
    expect(it.height).toBeCloseTo(2.0)
    expect(it.depth).toBeCloseTo(0, 5)
  })

  it('excludes a piece far from the wall', () => {
    const plan = wallPlan()
    // 3 m off the wall → well past the 0.6 m threshold.
    expect(projectWallElevation(plan, plan.walls[0]!, [place(2, 3)], defs).items).toHaveLength(0)
  })

  it('excludes a near piece that sits off the ends of the wall span', () => {
    const plan = wallPlan()
    // Flush (z=0.25) but centred at x=10 → entirely past the 4 m wall.
    expect(projectWallElevation(plan, plan.walls[0]!, [place(10, 0.25)], defs).items).toHaveLength(
      0,
    )
  })

  it('clamps a piece that overhangs a wall end to the wall span', () => {
    const plan = wallPlan()
    // Centred at x=3.8 (w=1 → 3.3..4.3); clamps to 3.3..4.0.
    const el = projectWallElevation(plan, plan.walls[0]!, [place(3.8, 0.25)], defs)
    expect(el.items[0]!.x0).toBeCloseTo(3.3)
    expect(el.items[0]!.x1).toBeCloseTo(4.0)
  })

  it('sorts items farthest-from-wall first (back-to-front paint order)', () => {
    const plan = wallPlan()
    const near = place(1, 0.25) // depth ~0
    near.id = 'near'
    const far = place(3, 0.5) // d=0.5 centred at z=0.5 → near edge z=0.25
    far.id = 'far'
    const el = projectWallElevation(plan, plan.walls[0]!, [near, far], defs)
    expect(el.items.map((i) => i.id)).toEqual(['far', 'near'])
  })

  it('skips items whose def is unresolvable', () => {
    const plan = wallPlan()
    const ghost = { ...place(2, 0.25), defId: 'missing' }
    expect(projectWallElevation(plan, plan.walls[0]!, [ghost], defs).items).toHaveLength(0)
  })
})

// Mirrors the REAL 'flatscreen-tv' def shape: `mounted` is NOT set at the def
// level (a TV can go either way), so "is it mounted right now" is decided by
// the live `mount` enum prop (`'stand'`/`'wall'`) — the conditional-mount
// case `isWallMounted` has to handle.
const tv: ParametricDef = {
  id: 'flatscreen-tv',
  name: 'TV',
  category: 'electronics',
  kind: 'parametric',
  primitive: 'FlatscreenTV',
  defaultFootprint: { w: 1.2, d: 0.08, h: 0.7 },
  paramSchema: [
    {
      kind: 'enum',
      key: 'mount',
      label: 'Mount',
      default: 'stand',
      options: [
        { value: 'stand', label: 'On stand' },
        { value: 'wall', label: 'Wall' },
      ],
    },
    {
      kind: 'number',
      key: 'mountHeight',
      label: 'Mount',
      min: 0.8,
      max: 1.6,
      step: 0.05,
      default: 1.35,
    },
  ],
}
const sconce: ParametricDef = {
  id: 'wall-sconce',
  name: 'Sconce',
  category: 'lighting',
  kind: 'parametric',
  primitive: 'WallSconce',
  defaultFootprint: { w: 0.2, d: 0.1, h: 0.3 },
  mounted: true,
  paramSchema: [
    {
      kind: 'number',
      key: 'mountHeight',
      label: 'Mount',
      min: 1.0,
      max: 2.0,
      step: 0.05,
      default: 1.7,
    },
  ],
}
const sofa: ParametricDef = {
  id: 'sofa-3',
  name: 'Sofa',
  category: 'seating',
  kind: 'parametric',
  primitive: 'Sofa',
  defaultFootprint: { w: 2.0, d: 0.9, h: 0.85 },
  paramSchema: [],
}
const mountDefs = { ...defs, [tv.id]: tv, [sconce.id]: sconce, [sofa.id]: sofa }
const placeDef = (
  defId: string,
  cx: number,
  cz: number,
  props: Record<string, number | string> = {},
): FurnitureItem => ({
  id: `${defId}-${cx}-${cz}`,
  defId,
  position: [cx, cz],
  rotation: 0,
  props,
})

describe('itemMountHeight (H3)', () => {
  it('returns the live mountHeight prop for a wall-mounted TV', () => {
    expect(
      itemMountHeight(placeDef('flatscreen-tv', 0, 0, { mount: 'wall', mountHeight: 1.1 }), tv),
    ).toBe(1.1)
  })

  it('falls back to the paramSchema default height when the item has not customised it', () => {
    expect(itemMountHeight(placeDef('flatscreen-tv', 0, 0, { mount: 'wall' }), tv)).toBe(1.35)
  })

  it('returns null for a TV on its stand (conditional mount, not wall-mounted)', () => {
    expect(itemMountHeight(placeDef('flatscreen-tv', 0, 0, { mount: 'stand' }), tv)).toBeNull()
    // Default `mount` (no live prop) is 'stand' too.
    expect(itemMountHeight(placeDef('flatscreen-tv', 0, 0), tv)).toBeNull()
  })

  it('returns null for a floor-standing (non-mounted) item', () => {
    expect(itemMountHeight(placeDef('sofa-3', 0, 0), sofa)).toBeNull()
  })
})

describe('projectWallElevation — mount heights (H3)', () => {
  it('annotates a wall-mounted TV with its AFFL mount height', () => {
    const plan = wallPlan()
    const item = placeDef('flatscreen-tv', 2, 0.1, { mount: 'wall', mountHeight: 1.1 })
    const el = projectWallElevation(plan, plan.walls[0]!, [item], mountDefs)
    expect(el.items).toHaveLength(1)
    expect(el.items[0]!.mountHeight).toBeCloseTo(1.1)
  })

  it('leaves a stand-mounted TV with no mountHeight (conditional mount off)', () => {
    const plan = wallPlan()
    const item = placeDef('flatscreen-tv', 2, 0.1, { mount: 'stand' })
    const el = projectWallElevation(plan, plan.walls[0]!, [item], mountDefs)
    expect(el.items[0]!.mountHeight).toBeUndefined()
  })

  it('annotates a mounted sconce with its own mount height', () => {
    const plan = wallPlan()
    const item = placeDef('wall-sconce', 2, 0.1, { mountHeight: 1.45 })
    const el = projectWallElevation(plan, plan.walls[0]!, [item], mountDefs)
    expect(el.items[0]!.mountHeight).toBeCloseTo(1.45)
  })

  it('leaves a floor-standing item with no mountHeight (no clutter)', () => {
    const plan = wallPlan()
    const item = placeDef('sofa-3', 2, 0.5)
    const el = projectWallElevation(plan, plan.walls[0]!, [item], mountDefs)
    expect(el.items[0]!.mountHeight).toBeUndefined()
  })
})

describe('projectAllElevations', () => {
  it('tolerates a partial plan with no walls array', () => {
    const partial = { ceilingHeight: 2.8 } as unknown as FloorPlan
    expect(projectAllElevations(partial, [], defs)).toEqual([])
  })

  it('returns one elevation per wall, in plan order', () => {
    const plan = wallPlan({
      walls: [
        { id: 'a', start: [0, 0], end: [4, 0], thickness: 'internal' },
        { id: 'b', start: [4, 0], end: [4, 3], thickness: 'internal' },
      ],
    })
    const els = projectAllElevations(plan, [], defs)
    expect(els.map((e) => e.wallId)).toEqual(['a', 'b'])
    expect(els[1]!.length).toBeCloseTo(3)
  })
})
