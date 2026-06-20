import { describe, expect, it } from 'vitest'
import type { FurnitureDef } from '../furniture/types'
import { roleForCategory, roleOf } from './arrangeRoles'

const def = (over: Partial<FurnitureDef>): Record<string, FurnitureDef> => ({
  x: {
    id: 'x',
    name: 'X',
    category: 'others',
    kind: 'parametric',
    primitive: 'BookStack',
    source: 'builtin',
    defaultFootprint: { w: 1, d: 1, h: 1 },
    paramSchema: [],
    ...over,
  } as FurnitureDef,
})

describe('roleForCategory', () => {
  it('maps each category to a sensible arrange role', () => {
    expect(roleForCategory('beds')).toBe('bed')
    expect(roleForCategory('seating')).toBe('seating')
    expect(roleForCategory('storage')).toBe('storage')
    expect(roleForCategory('appliances')).toBe('storage')
    expect(roleForCategory('textiles')).toBe('rug')
    expect(roleForCategory('electronics')).toBe('media')
    expect(roleForCategory('tables')).toBe('lowTable')
    expect(roleForCategory('lighting')).toBe('floorLamp')
  })
  it('falls back to "other" for un-slotted categories', () => {
    expect(roleForCategory('kitchen')).toBe('other')
    expect(roleForCategory('bathroom')).toBe('other')
    expect(roleForCategory('decor')).toBe('other')
    expect(roleForCategory('outdoor')).toBe('other')
  })
})

describe('roleOf', () => {
  it('uses the explicit ROLE map first', () => {
    expect(roleOf('sofa-3seat', {})).toBe('seating')
    expect(roleOf('tv-console', {})).toBe('mediaConsole')
    expect(roleOf('dining-chair', {})).toBe('diningChair')
    expect(roleOf('wardrobe', {})).toBe('storage')
  })

  it('returns "other" for an unknown def absent from the catalog', () => {
    expect(roleOf('totally-unknown', {})).toBe('other')
  })

  it('honours collision flags for imported defs (mounted → mounted)', () => {
    expect(roleOf('x', def({ mounted: true }))).toBe('mounted')
  })

  it('honours noClip (a rug lays flat) before category fallback', () => {
    expect(roleOf('x', def({ noClip: true, category: 'textiles' }))).toBe('rug')
  })

  it('falls back to the category role for an un-mapped, non-mounted def', () => {
    expect(roleOf('x', def({ category: 'beds' }))).toBe('bed')
    expect(roleOf('x', def({ category: 'seating' }))).toBe('seating')
  })

  it('mounted takes priority over the category fallback', () => {
    // A mounted electronics item (e.g. soundbar-like import) → mounted, not media.
    expect(roleOf('x', def({ mounted: true, category: 'electronics' }))).toBe('mounted')
  })
})
