import { beforeEach, describe, expect, it } from 'vitest'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { useStore } from '../store'

describe('applyLayoutPreset', () => {
  beforeEach(() => {
    // Start from a clean, known state with empty history.
    useStore.getState().resetToEmpty()
    useStore.setState({ past: [], future: [] } as never)
  })

  it('applies furniture + finishes and is a SINGLE undo step', () => {
    const preset = LAYOUT_PRESETS[0]
    const beforeItems = useStore.getState().items.length
    useStore.getState().applyLayoutPreset(preset.id)

    const s = useStore.getState()
    expect(s.items.length).toBeGreaterThan(beforeItems)
    // The coordinated palette was applied (at least one room got the preset wall).
    expect(Object.values(s.finishes.walls)).toContain(preset.wall)
    // Exactly one history entry was pushed for the whole preset.
    expect(s.past.length).toBe(1)

    // One undo fully reverts furniture + finishes.
    useStore.getState().undo()
    expect(useStore.getState().items.length).toBe(beforeItems)
  })

  it('is a no-op for an unknown preset id', () => {
    useStore.getState().applyLayoutPreset('does-not-exist')
    expect(useStore.getState().past.length).toBe(0)
    expect(useStore.getState().items.length).toBe(0)
  })
})
