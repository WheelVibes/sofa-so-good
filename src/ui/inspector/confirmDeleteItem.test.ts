import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { confirmDeleteItem } from './itemTransforms'

function item(id: string, locked = false): FurnitureItem {
  return { id, defId: 'bed-double', position: [1, 1], rotation: 0, props: {}, locked }
}

/**
 * Bug report #2: a single delete is now confirm-gated (an explicit prompt,
 * distinct from the transform "Apply change?" pill) rather than firing
 * immediately. `confirmDeleteItem` deletes only when `confirmAction` resolves
 * true, never for a locked item, and never even prompts for a locked item.
 */
describe('confirmDeleteItem (bug #2)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('deletes the item when the confirm prompt is accepted', async () => {
    useStore.getState().setItems([item('a'), item('b')])
    useStore.setState({ confirmAction: vi.fn(async () => true) })
    await confirmDeleteItem('a')
    expect(useStore.getState().items.map((i) => i.id)).toEqual(['b'])
  })

  it('keeps the item when the confirm prompt is dismissed', async () => {
    useStore.getState().setItems([item('a')])
    const confirmAction = vi.fn(async () => false)
    useStore.setState({ confirmAction })
    await confirmDeleteItem('a')
    expect(confirmAction).toHaveBeenCalledOnce()
    expect(useStore.getState().items.map((i) => i.id)).toEqual(['a'])
  })

  it('never deletes or even prompts for a locked item', async () => {
    useStore.getState().setItems([item('a', true)])
    const confirmAction = vi.fn(async () => true)
    useStore.setState({ confirmAction })
    await confirmDeleteItem('a')
    expect(confirmAction).not.toHaveBeenCalled()
    expect(useStore.getState().items).toHaveLength(1)
  })
})
