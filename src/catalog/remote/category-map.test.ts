import { describe, expect, it } from 'vitest'
import { mapPolyHavenFurnitureCategory } from './category-map'

describe('mapPolyHavenFurnitureCategory', () => {
  it('maps seating-related tags to seating', () => {
    expect(mapPolyHavenFurnitureCategory(['sofa', 'living'])).toBe('seating')
    expect(mapPolyHavenFurnitureCategory(['chair'])).toBe('seating')
  })
  it('maps tables', () => {
    expect(mapPolyHavenFurnitureCategory(['desk'])).toBe('tables')
  })
  it('falls back to decor', () => {
    expect(mapPolyHavenFurnitureCategory(['weird'])).toBe('decor')
    expect(mapPolyHavenFurnitureCategory([])).toBe('decor')
  })
})
