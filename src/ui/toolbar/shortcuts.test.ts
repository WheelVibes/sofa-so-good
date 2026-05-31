import { describe, expect, it } from 'vitest'
import { shortcutLabel } from './shortcuts'

describe('shortcutLabel', () => {
  it('renders a plain letter key', () => {
    expect(shortcutLabel('toggleMeasurements')).toBe('M')
    expect(shortcutLabel('toggleCatalog')).toBe('C')
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
