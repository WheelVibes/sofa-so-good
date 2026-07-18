import { describe, expect, it } from 'vitest'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { sectionSilhouettes } from './sectionFigure'

function item(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'i1',
    defId: 'sofa-basic',
    position: [1, 2],
    rotation: 0,
    props: {},
    ...overrides,
  } as FurnitureItem
}

function parametricDef(overrides: Partial<FurnitureDef> = {}): FurnitureDef {
  return {
    id: 'sofa-basic',
    name: 'Sofa',
    category: 'seating',
    kind: 'parametric',
    primitive: 'Sofa',
    paramSchema: [],
    defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 },
    ...overrides,
  } as unknown as FurnitureDef
}

describe('sectionSilhouettes', () => {
  it('projects a resolvable item to its footprint corners + height', () => {
    const def = parametricDef()
    const out = sectionSilhouettes([item()], { 'sofa-basic': def })
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('i1')
    expect(out[0]!.label).toBe('Sofa') // falls back to def.name when item has no label
    expect(out[0]!.height).toBeCloseTo(0.8, 6)
    expect(out[0]!.corners).toHaveLength(4)
  })

  it('prefers the item label over the def name when present', () => {
    const def = parametricDef()
    const out = sectionSilhouettes([item({ label: 'Grandma’s sofa' })], {
      'sofa-basic': def,
    })
    expect(out[0]!.label).toBe('Grandma’s sofa')
  })

  it('skips an item whose def is not in the catalog', () => {
    const out = sectionSilhouettes([item({ defId: 'missing' })], {})
    expect(out).toEqual([])
  })

  it('skips a def with no defaultFootprint', () => {
    const def = { ...parametricDef(), defaultFootprint: undefined } as unknown as FurnitureDef
    const out = sectionSilhouettes([item()], { 'sofa-basic': def })
    expect(out).toEqual([])
  })

  it('processes multiple items independently, preserving order and skipping only the unresolvable ones', () => {
    const def = parametricDef()
    const items = [
      item({ id: 'a', defId: 'sofa-basic' }),
      item({ id: 'b', defId: 'nope' }),
      item({ id: 'c', defId: 'sofa-basic', position: [5, 5] }),
    ]
    const out = sectionSilhouettes(items, { 'sofa-basic': def })
    expect(out.map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('a scaled parametric item raises the projected height (real height math, not a stub)', () => {
    const def = parametricDef()
    const scaled = item({ props: { scale: 2 } })
    const out = sectionSilhouettes([scaled], { 'sofa-basic': def })
    expect(out[0]!.height).toBeCloseTo(1.6, 6)
  })

  it('returns an empty array for an empty item list', () => {
    expect(sectionSilhouettes([], { 'sofa-basic': parametricDef() })).toEqual([])
  })
})
