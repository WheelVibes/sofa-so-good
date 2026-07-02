import { describe, expect, it } from 'vitest'
import { shortcutLabel } from './shortcuts'

describe('shortcutLabel', () => {
  it('renders a plain letter key', () => {
    expect(shortcutLabel('toggleMeasurements')).toBe('M')
    expect(shortcutLabel('toggleCatalog')).toBe('C')
  })
  // Pinned for P24 (menu/tooltip .mi-kbd + .sk chips) — these labels are
  // shown to users, so a change here must be intentional, not accidental.
  it('pins the labels used by menu shortcut chips', () => {
    expect(shortcutLabel('togglePlanEditor')).toBe('P')
    expect(shortcutLabel('undo')).toBe('Ctrl Z')
  })
  it('renders mod-key bindings with a Ctrl/Cmd prefix', () => {
    expect(shortcutLabel('undo')).toBe('Ctrl Z')
    expect(shortcutLabel('redo')).toBe('Ctrl Y')
  })
  it('returns empty string for an unknown id', () => {
    // @ts-expect-error intentionally invalid id
    expect(shortcutLabel('nope')).toBe('')
  })
})
