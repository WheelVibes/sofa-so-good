import { describe, expect, it } from 'vitest'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import type { PlanWall } from '../types'
import type { Sh3dImportItem } from './sh3d'
import {
  associateOpenings,
  defForCategory,
  resolveFurniture,
  resolveSh3dImport,
} from './sh3dPlacement'

/** Deterministic id generator for tests. */
function makeGenId(): (p: string) => string {
  let n = 0
  return (p: string) => `${p}-${n++}`
}

/** A minimal parametric def for collision/footprint purposes. */
function def(
  id: string,
  category: FurnitureDef['category'],
  w: number,
  d: number,
  h = 0.8,
): FurnitureDef {
  return {
    kind: 'parametric',
    id,
    name: id,
    category,
    primitive: 'Sofa',
    paramSchema: [],
    defaultFootprint: { w, d, h },
  } as FurnitureDef
}

const CATALOG: Record<string, FurnitureDef> = {
  'sofa-small': def('sofa-small', 'seating', 1.4, 0.8),
  'sofa-big': def('sofa-big', 'seating', 2.2, 0.95),
  bed: def('bed', 'beds', 1.6, 2.0),
}

/** A furniture import descriptor. */
function item(over: Partial<Sh3dImportItem>): Sh3dImportItem {
  return {
    id: 'p',
    name: 'Piece',
    category: 'seating',
    position: [1, 1],
    rotation: 0,
    width: 2,
    depth: 0.9,
    height: 0.8,
    elevation: 0,
    ...over,
  }
}

describe('defForCategory — footprint-aware catalog resolution', () => {
  it('picks the closest-footprint def within the category', () => {
    const big = defForCategory(CATALOG, 'seating', { w: 2.2, d: 0.95 })
    expect(big?.id).toBe('sofa-big')
    const small = defForCategory(CATALOG, 'seating', { w: 1.4, d: 0.8 })
    expect(small?.id).toBe('sofa-small')
  })

  it('matches orientation-agnostically (rotated 90° piece)', () => {
    // A 0.95×2.2 piece (rotated) should still resolve to the 2.2×0.95 def.
    const d = defForCategory(CATALOG, 'seating', { w: 0.95, d: 2.2 })
    expect(d?.id).toBe('sofa-big')
  })

  it('returns null when no def exists for the category', () => {
    expect(defForCategory(CATALOG, 'lighting', { w: 1, d: 1 })).toBeNull()
  })
})

describe('resolveFurniture — catalog resolution + collision', () => {
  it('resolves a mapped piece to a catalog item at its position/rotation', () => {
    const { placedFurniture, warnings } = resolveFurniture(
      [item({ id: 'p1', position: [3, 3], rotation: 1.2 })],
      CATALOG,
      [],
      makeGenId(),
    )
    expect(placedFurniture).toHaveLength(1)
    expect(placedFurniture[0]!.defId).toBe('sofa-big')
    expect(placedFurniture[0]!.position).toEqual([3, 3])
    expect(placedFurniture[0]!.rotation).toBeCloseTo(1.2, 6)
    expect(warnings).toHaveLength(0)
  })

  it('skips opening pieces (handled by associateOpenings)', () => {
    const { placedFurniture } = resolveFurniture(
      [item({ id: 'd1', opening: 'door', category: null })],
      CATALOG,
      [],
      makeGenId(),
    )
    expect(placedFurniture).toHaveLength(0)
  })

  it('skips pieces with no category match (parser already warned)', () => {
    const { placedFurniture, warnings } = resolveFurniture(
      [item({ id: 'p1', category: null })],
      CATALOG,
      [],
      makeGenId(),
    )
    expect(placedFurniture).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('warns when a category has no catalog def, never dropping silently', () => {
    const { placedFurniture, warnings } = resolveFurniture(
      [item({ id: 'p1', category: 'lighting', name: 'Floor lamp' })],
      CATALOG,
      [],
      makeGenId(),
    )
    expect(placedFurniture).toHaveLength(0)
    expect(warnings.some((w) => /Floor lamp/.test(w))).toBe(true)
  })

  it('is collision-aware: overlapping imports are dropped + reported', () => {
    // Two big sofas at the same spot — only one survives the collision filter.
    const items = [item({ id: 'a', position: [2, 2] }), item({ id: 'b', position: [2, 2] })]
    const { placedFurniture, warnings } = resolveFurniture(items, CATALOG, [], makeGenId())
    expect(placedFurniture).toHaveLength(1)
    expect(warnings.some((w) => /overlap/i.test(w))).toBe(true)
  })

  it('collides against existing scene items too', () => {
    const existing: FurnitureItem[] = [
      { id: 'x', defId: 'sofa-big', position: [2, 2], rotation: 0, props: {} },
    ]
    const { placedFurniture } = resolveFurniture(
      [item({ id: 'a', position: [2, 2] })],
      CATALOG,
      existing,
      makeGenId(),
    )
    expect(placedFurniture).toHaveLength(0)
  })

  it('handles an empty furniture list', () => {
    const { placedFurniture, warnings } = resolveFurniture([], CATALOG, [], makeGenId())
    expect(placedFurniture).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })
})

describe('associateOpenings — door/window → nearest wall', () => {
  // A 4 m horizontal wall along z=0 and a 4 m vertical wall along x=4.
  const walls: PlanWall[] = [
    { id: 'w-top', start: [0, 0], end: [4, 0], thickness: 'external' },
    { id: 'w-right', start: [4, 0], end: [4, 4], thickness: 'internal' },
  ]

  it('snaps a door centred on a wall to that wall with the right offset/width', () => {
    const door = item({
      id: 'd1',
      name: 'Front door',
      opening: 'door',
      category: null,
      position: [2, 0],
      width: 0.9,
      height: 2.05,
    })
    const { openings, warnings } = associateOpenings([door], walls, makeGenId())
    expect(warnings).toHaveLength(0)
    expect(openings).toHaveLength(1)
    const o = openings[0]!
    expect(o.kind).toBe('door')
    expect(o.wallId).toBe('w-top')
    // Centre at along-offset 2 m, width 0.9 → start = 2 − 0.45 = 1.55.
    expect(o.offset).toBeCloseTo(1.55, 3)
    expect(o.width).toBeCloseTo(0.9, 3)
    expect(o.sill).toBe(0)
    expect(o.head).toBeCloseTo(2.05, 3)
  })

  it('associates a window to the nearest wall + derives sill/head', () => {
    const win = item({
      id: 'wn1',
      name: 'Bedroom window',
      opening: 'window',
      category: null,
      position: [4, 2],
      width: 1.2,
      height: 1.2,
    })
    const { openings } = associateOpenings([win], walls, makeGenId())
    expect(openings).toHaveLength(1)
    expect(openings[0]!.wallId).toBe('w-right')
    expect(openings[0]!.kind).toBe('window')
    expect(openings[0]!.sill).toBeGreaterThan(0)
    expect(openings[0]!.head).toBeGreaterThan(openings[0]!.sill)
  })

  it('honours the source elevation as the sill (SH3D `elevation` attribute)', () => {
    const win = item({
      id: 'wn2',
      name: 'Raised window',
      opening: 'window',
      category: null,
      position: [4, 2],
      width: 1.2,
      height: 0.8,
      elevation: 1.2,
    })
    const { openings } = associateOpenings([win], walls, makeGenId())
    expect(openings).toHaveLength(1)
    expect(openings[0]!.sill).toBeCloseTo(1.2, 3)
    expect(openings[0]!.head).toBeCloseTo(2.0, 3)
  })

  it('falls back to the default sill when a window has no elevation', () => {
    const win = item({
      id: 'wn3',
      name: 'Plain window',
      opening: 'window',
      category: null,
      position: [4, 2],
      width: 1.2,
      height: 1.2,
      elevation: 0,
    })
    const { openings } = associateOpenings([win], walls, makeGenId())
    expect(openings[0]!.sill).toBeCloseTo(0.9, 3)
    expect(openings[0]!.head).toBeCloseTo(2.1, 3)
  })

  it('clamps a window elevation at/above the ceiling back to the default sill', () => {
    const win = item({
      id: 'wn4',
      name: 'Corrupt window',
      opening: 'window',
      category: null,
      position: [4, 2],
      width: 1.2,
      height: 0.8,
      elevation: 2.6, // at the default ceiling — never a valid sill
    })
    const { openings } = associateOpenings([win], walls, makeGenId(), 2.6)
    expect(openings[0]!.sill).toBeCloseTo(0.9, 3)
  })

  it('leaves a normal (elevation 0) door on the floor', () => {
    const door = item({
      id: 'd5',
      name: 'Front door',
      opening: 'door',
      category: null,
      position: [2, 0],
      width: 0.9,
      height: 2.05,
      elevation: 0,
    })
    const { openings } = associateOpenings([door], walls, makeGenId())
    expect(openings[0]!.sill).toBe(0)
    expect(openings[0]!.head).toBeCloseTo(2.05, 3)
  })

  it('warns (no opening) when a piece is not near any wall', () => {
    const stray = item({
      id: 'd2',
      name: 'Lost door',
      opening: 'door',
      category: null,
      position: [50, 50],
    })
    const { openings, warnings } = associateOpenings([stray], walls, makeGenId())
    expect(openings).toHaveLength(0)
    expect(warnings.some((w) => /Lost door/.test(w) && /not near any wall/i.test(w))).toBe(true)
  })

  it('clamps the offset so a wide opening stays on the wall', () => {
    const wide = item({
      id: 'd3',
      name: 'Wide door',
      opening: 'door',
      category: null,
      position: [0.2, 0], // near the wall start
      width: 1.0,
    })
    const { openings } = associateOpenings([wide], walls, makeGenId())
    expect(openings[0]!.offset).toBeGreaterThanOrEqual(0)
    expect(openings[0]!.offset + openings[0]!.width).toBeLessThanOrEqual(4 + 1e-6)
  })

  it('ignores non-opening furniture pieces', () => {
    const { openings } = associateOpenings([item({ id: 's' })], walls, makeGenId())
    expect(openings).toHaveLength(0)
  })

  it('handles an empty list', () => {
    const { openings, warnings } = associateOpenings([], walls, makeGenId())
    expect(openings).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })
})

describe('resolveSh3dImport — combined pass', () => {
  const walls: PlanWall[] = [{ id: 'w', start: [0, 0], end: [5, 0], thickness: 'external' }]

  it('returns placed furniture + openings + merged warnings', () => {
    const items = [
      item({ id: 'sofa', position: [2, 2] }),
      item({ id: 'door', name: 'Door', opening: 'door', category: null, position: [3, 0] }),
      item({ id: 'lamp', category: 'lighting', name: 'Lamp' }), // no def → warn
    ]
    const res = resolveSh3dImport(items, walls, CATALOG, [], makeGenId())
    expect(res.placedFurniture).toHaveLength(1)
    expect(res.placedFurniture[0]!.defId).toBe('sofa-big')
    expect(res.openings).toHaveLength(1)
    expect(res.openings[0]!.kind).toBe('door')
    expect(res.warnings.some((w) => /Lamp/.test(w))).toBe(true)
  })

  it('handles a fully empty import', () => {
    const res = resolveSh3dImport([], walls, CATALOG, [], makeGenId())
    expect(res.placedFurniture).toHaveLength(0)
    expect(res.openings).toHaveLength(0)
    expect(res.warnings).toHaveLength(0)
  })
})
