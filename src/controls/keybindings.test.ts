import { describe, expect, it } from 'vitest'
import { KEYBINDINGS } from './keybindings'

describe('KEYBINDINGS', () => {
  it('defines the new toolbar shortcuts', () => {
    expect(KEYBINDINGS.topView).toBe('KeyO')
    expect(KEYBINDINGS.resetView).toBe('KeyH')
    expect(KEYBINDINGS.tidyHome).toBe('KeyL')
  })
  it('the new keys do not collide with any existing binding value', () => {
    const values = Object.values(KEYBINDINGS)
    for (const k of ['KeyO', 'KeyH', 'KeyL']) {
      expect(values.filter((v) => v === k).length).toBe(1)
    }
  })
})
