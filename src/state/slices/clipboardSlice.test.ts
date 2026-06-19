import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import type { ClipboardEntry } from './clipboardSlice'

const entry = (defId: string, pos: [number, number]): ClipboardEntry => ({
  defId: defId as ClipboardEntry['defId'],
  rotation: 0,
  props: { color: '#fff' },
  sourcePosition: pos,
})

describe('clipboardSlice (multi-item copy/paste, PC2-MULTI-DUP-PASTE)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('stores a whole selection (array) and deep-copies props + positions', () => {
    const a = entry('sofa-3seat', [1, 2])
    const b = entry('coffee-table', [3, 4])
    useStore.getState().setClipboard([a, b])
    const cb = useStore.getState().clipboard
    expect(cb).toHaveLength(2)
    // Deep copies, not references — mutating the source must not affect the store.
    a.props.color = '#000'
    a.sourcePosition[0] = 99
    expect(cb?.[0].props.color).toBe('#fff')
    expect(cb?.[0].sourcePosition[0]).toBe(1)
    expect(cb?.[1].defId).toBe('coffee-table')
  })

  it('normalises null / empty array to null', () => {
    useStore.getState().setClipboard([entry('sofa-3seat', [0, 0])])
    expect(useStore.getState().clipboard).not.toBeNull()
    useStore.getState().setClipboard([])
    expect(useStore.getState().clipboard).toBeNull()
    useStore.getState().setClipboard([entry('sofa-3seat', [0, 0])])
    useStore.getState().setClipboard(null)
    expect(useStore.getState().clipboard).toBeNull()
  })
})
