import { describe, expect, it } from 'vitest'
import type { RoomKind } from '../../analysis/suggestions'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import {
  defaultCategoryForRoomKind,
  orderCategoriesForRoomKind,
  relevantCategoriesForRoomKind,
} from './roomAwareCategories'

const allCounts = (n = 1): Record<FurnitureCategory, number> =>
  Object.fromEntries(FURNITURE_CATEGORIES.map((c) => [c, n])) as Record<FurnitureCategory, number>

describe('relevantCategoriesForRoomKind', () => {
  it('surfaces beds/wardrobes(storage)/nightstands(storage) first for a bedroom', () => {
    const cats = relevantCategoriesForRoomKind('bedroom')
    expect(cats[0]).toBe('beds')
    expect(cats).toContain('storage')
  })

  it('surfaces appliances/cabinets(kitchen) first for a kitchen', () => {
    const cats = relevantCategoriesForRoomKind('kitchen')
    expect(cats[0]).toBe('appliances')
    expect(cats).toContain('kitchen')
  })

  it('surfaces bathroom fixtures first for a bath', () => {
    expect(relevantCategoriesForRoomKind('bath')[0]).toBe('bathroom')
  })

  it('surfaces sofas(seating)/tables/TV(electronics) first for living', () => {
    const cats = relevantCategoriesForRoomKind('living')
    expect(cats[0]).toBe('seating')
    expect(cats).toContain('tables')
    expect(cats).toContain('electronics')
  })

  it('is empty for an unmapped kind (other) and for null (no room active)', () => {
    expect(relevantCategoriesForRoomKind('other')).toEqual([])
    expect(relevantCategoriesForRoomKind(null)).toEqual([])
  })

  it('never lists a category outside the known FurnitureCategory vocabulary', () => {
    const kinds: RoomKind[] = ['living', 'dining', 'bedroom', 'kitchen', 'bath', 'study', 'balcony']
    for (const k of kinds) {
      for (const c of relevantCategoriesForRoomKind(k)) {
        expect(FURNITURE_CATEGORIES).toContain(c)
      }
    }
  })
})

describe('orderCategoriesForRoomKind', () => {
  it('puts the bedroom-relevant categories first, then the rest in curated order', () => {
    const order = orderCategoriesForRoomKind('bedroom')
    expect(order.slice(0, 5)).toEqual(['beds', 'storage', 'textiles', 'lighting', 'decor'])
    // Every category still appears exactly once — no drops, no duplicates.
    expect(order).toHaveLength(FURNITURE_CATEGORIES.length)
    expect(new Set(order).size).toBe(FURNITURE_CATEGORIES.length)
  })

  it('falls back to the untouched curated order for an unknown kind', () => {
    expect(orderCategoriesForRoomKind('other')).toEqual(FURNITURE_CATEGORIES)
  })

  it('falls back to the untouched curated order for no active room (null)', () => {
    expect(orderCategoriesForRoomKind(null)).toEqual(FURNITURE_CATEGORIES)
  })
})

describe('defaultCategoryForRoomKind', () => {
  it('lands on beds for a bedroom when beds have cards', () => {
    expect(defaultCategoryForRoomKind('bedroom', allCounts(), 'seating')).toBe('beds')
  })

  it('lands on appliances for a kitchen when appliances have cards', () => {
    expect(defaultCategoryForRoomKind('kitchen', allCounts(), 'seating')).toBe('appliances')
  })

  it('skips a relevant category with zero cards and picks the next relevant one', () => {
    const counts = allCounts()
    counts.beds = 0 // e.g. every bed def filtered out / not yet loaded
    expect(defaultCategoryForRoomKind('bedroom', counts, 'seating')).toBe('storage')
  })

  it('falls back to the provided fallback when nothing in the room-relevant list has cards', () => {
    const counts = allCounts(0)
    counts.seating = 3 // only a non-relevant category has cards
    expect(defaultCategoryForRoomKind('bedroom', counts, 'seating')).toBe('seating')
  })

  it('falls back for an unmapped kind exactly like the flat default would', () => {
    const counts = allCounts(0)
    counts.decor = 2
    expect(defaultCategoryForRoomKind('other', counts, 'decor')).toBe('decor')
    expect(defaultCategoryForRoomKind(null, counts, 'decor')).toBe('decor')
  })

  it('returns the fallback outright when the whole catalog is empty', () => {
    expect(defaultCategoryForRoomKind('bedroom', {}, 'seating')).toBe('seating')
  })
})
