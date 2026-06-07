import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS } from './categoryColors'
import { FURNITURE_CATEGORIES } from './types'

describe('CATEGORY_COLORS', () => {
  it('covers every furniture category with a valid hex colour', () => {
    for (const cat of FURNITURE_CATEGORIES) {
      const hex = CATEGORY_COLORS[cat]
      expect(hex, `missing colour for ${cat}`).toBeDefined()
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('uses a distinct colour per category', () => {
    const values = FURNITURE_CATEGORIES.map((c) => CATEGORY_COLORS[c])
    expect(new Set(values).size).toBe(values.length)
  })
})
