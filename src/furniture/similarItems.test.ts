import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { similarItems } from './similarItems'
import type { FurnitureDef } from './types'

/** Minimal parametric def factory with an explicit footprint. */
function para(id: string, category: FurnitureDef['category'], w: number, d: number): FurnitureDef {
  return {
    kind: 'parametric',
    id: id as never,
    name: id,
    category,
    primitive: 'Bed' as never,
    defaultFootprint: { w, d, h: 1 },
    paramSchema: [],
  }
}

/** Minimal built-in GLB def factory with an explicit footprint. */
function glb(id: string, category: FurnitureDef['category'], w: number, d: number): FurnitureDef {
  return {
    kind: 'gltf',
    source: 'builtin',
    id: id as never,
    name: id,
    category,
    defaultFootprint: { w, d, h: 1 },
    url: `/${id}.glb`,
    license: 'CC0',
  }
}

function asCatalog(defs: FurnitureDef[]): Record<string, FurnitureDef> {
  return Object.fromEntries(defs.map((d) => [d.id, d]))
}

describe('similarItems', () => {
  it('returns [] for an unknown defId', () => {
    expect(similarItems('nope', asCatalog([para('a', 'seating', 1, 1)]))).toEqual([])
  })

  it('returns [] when the category has no other members', () => {
    const cat = asCatalog([para('sofa', 'seating', 2, 1), para('table', 'tables', 1, 1)])
    expect(similarItems('sofa', cat)).toEqual([])
  })

  it('excludes the def itself and any other category', () => {
    const cat = asCatalog([
      para('sofa', 'seating', 2, 1),
      para('chair', 'seating', 0.6, 0.6),
      para('table', 'tables', 1, 1),
    ])
    const out = similarItems('sofa', cat)
    expect(out).not.toContain('sofa')
    expect(out).not.toContain('table')
    expect(out).toEqual(['chair'])
  })

  it('ranks by nearest footprint (W×D distance), nearest first', () => {
    const cat = asCatalog([
      para('target', 'seating', 2.0, 0.9),
      para('near', 'seating', 2.1, 0.9), // closest
      para('mid', 'seating', 2.5, 1.0),
      para('far', 'seating', 0.5, 0.5), // furthest
    ])
    expect(similarItems('target', cat)).toEqual(['near', 'mid', 'far'])
  })

  it('is orientation-independent (compares sorted dims)', () => {
    // A 2.0×0.9 piece and a 0.9×2.0 piece are the same footprint rotated 90°.
    const cat = asCatalog([
      para('target', 'seating', 2.0, 0.9),
      para('rotated', 'seating', 0.9, 2.0), // identical footprint → distance 0
      para('other', 'seating', 1.5, 1.0),
    ])
    expect(similarItems('target', cat)[0]).toBe('rotated')
  })

  it('breaks footprint ties by name then id', () => {
    const cat = asCatalog([
      para('t', 'seating', 1, 1),
      para('z-zeta', 'seating', 1.5, 1.5),
      para('a-alpha', 'seating', 1.5, 1.5), // same footprint distance as zeta
    ])
    // Equal distance → alphabetical by name: a-alpha before z-zeta.
    expect(similarItems('t', cat)).toEqual(['a-alpha', 'z-zeta'])
  })

  it('honours the limit', () => {
    const cat = asCatalog([
      para('t', 'seating', 1, 1),
      para('a', 'seating', 1.1, 1),
      para('b', 'seating', 1.2, 1),
      para('c', 'seating', 1.3, 1),
    ])
    expect(similarItems('t', cat, 2)).toEqual(['a', 'b'])
    expect(similarItems('t', cat, 0)).toEqual([])
  })

  it('mixes parametric, GLB and IKEA-shaped defs by footprint', () => {
    const ikea: FurnitureDef = {
      kind: 'gltf',
      source: 'ikea',
      id: 'ikea-sofa' as never,
      name: 'IKEA sofa',
      category: 'seating',
      defaultFootprint: { w: 2.05, d: 0.9, h: 0.8 },
      groupKey: 'sofa',
      activeVariant: 'grey',
      variants: [],
      uploadedAt: '2024',
      license: 'IKEA',
      attribution: 'IKEA',
    }
    const cat = asCatalog([
      para('target', 'seating', 2.0, 0.9),
      glb('glb-sofa', 'seating', 2.0, 0.9),
      ikea,
    ])
    const out = similarItems('target', cat)
    // Both alternatives are valid same-category siblings; the GLB (exact match)
    // ranks before the IKEA piece (slightly larger).
    expect(out).toEqual(['glb-sofa', 'ikea-sofa'])
  })

  it('smoke-tests against the real built-in catalog (beds are same-category siblings)', () => {
    const out = similarItems('bed-queen', BUILTIN_CATALOG)
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain('bed-queen')
    // Every result is a bed (same category) per the contract.
    for (const id of out) expect(BUILTIN_CATALOG[id].category).toBe('beds')
  })
})
