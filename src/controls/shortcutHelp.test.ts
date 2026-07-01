import { describe, expect, it } from 'vitest'
import { KEYBINDINGS } from './keybindings'
import { bindKey, SHORTCUT_GROUPS } from './shortcutHelp'

describe('shortcutHelp', () => {
  it('bindKey strips the Key prefix but leaves named codes', () => {
    expect(bindKey('rotate')).toBe('R') // 'KeyR'
    expect(bindKey('deleteSelected')).toBe('Delete')
    expect(bindKey('nudgeUp')).toBe('ArrowUp')
  })

  it('every group is non-empty and every row has key chips + a description', () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0)
    for (const g of SHORTCUT_GROUPS) {
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.rows.length).toBeGreaterThan(0)
      for (const r of g.rows) {
        expect(r.keys.length).toBeGreaterThan(0)
        expect(r.keys.every((k) => k.length > 0)).toBe(true)
        expect(r.desc.length).toBeGreaterThan(0)
      }
    }
  })

  it('row descriptions are unique (each is used as a render key)', () => {
    const descs = SHORTCUT_GROUPS.flatMap((g) => g.rows.map((r) => r.desc))
    expect(new Set(descs).size).toBe(descs.length)
  })

  it('binding-derived chips reflect the live KEYBINDINGS (stays in sync)', () => {
    // The rotate row shows the real rotate key; if the binding changes, so does this.
    const move = SHORTCUT_GROUPS.find((g) => g.title === 'Move & arrange')!
    const rotate = move.rows.find((r) => r.desc.startsWith('Rotate'))!
    expect(rotate.keys).toContain(bindKey('rotate'))
    expect(KEYBINDINGS.rotate).toBe('KeyR')
  })
})
