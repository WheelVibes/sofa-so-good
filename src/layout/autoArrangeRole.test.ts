import { describe, expect, it } from 'vitest'
import { roleForCategory } from './autoArrange'

describe('roleForCategory', () => {
  it('maps categories to sensible arrange roles', () => {
    expect(roleForCategory('beds')).toBe('bed')
    expect(roleForCategory('storage')).toBe('storage')
    expect(roleForCategory('seating')).toBe('seating')
    expect(roleForCategory('textiles')).toBe('rug')
    expect(roleForCategory('outdoor')).toBe('other')
    expect(roleForCategory('decor')).toBe('other')
  })
})
