import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { FURNITURE_CATEGORIES, type FurnitureDef } from './types'

describe('FurnitureCategory', () => {
  it('includes the IKEA-department categories', () => {
    for (const c of [
      'beds',
      'seating',
      'tables',
      'storage',
      'kitchen',
      'bathroom',
      'appliances',
      'lighting',
      'decor',
      'textiles',
      'outdoor',
      'electronics',
      'kids',
      'laundry',
      'others',
    ] as const) {
      expect(FURNITURE_CATEGORIES).toContain(c)
    }
  })
  it('has 15 categories', () => {
    expect(FURNITURE_CATEGORIES).toHaveLength(15)
  })
  it('lists others last (catch-all sorts to the end)', () => {
    expect(FURNITURE_CATEGORIES[FURNITURE_CATEGORIES.length - 1]).toBe('others')
  })

  it('every department has at least one built-in item (so no catalog tab is empty)', () => {
    // `others` is the import catch-all and is allowed to ship empty.
    const present = new Set(
      (Object.values(BUILTIN_CATALOG) as FurnitureDef[]).map((d) => d.category),
    )
    for (const c of FURNITURE_CATEGORIES) {
      if (c === 'others') continue
      expect(present.has(c), `category "${c}" has no built-in items`).toBe(true)
    }
  })
})
