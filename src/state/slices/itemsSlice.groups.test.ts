import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../store'

function item(id: string, pos: [number, number], groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: pos, rotation: 0, groupId, props: {} }
}

describe('deleteItem auto-dissolves its group', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('keeps a 2+ member group when one of 3 is deleted', () => {
    useStore
      .getState()
      .setItems([item('a', [0, 0], 'g1'), item('b', [1, 0], 'g1'), item('c', [2, 0], 'g1')])
    useStore.getState().deleteItem('a')
    const items = useStore.getState().items
    expect(items.find((i) => i.id === 'a')).toBeUndefined()
    expect(items.find((i) => i.id === 'b')?.groupId).toBe('g1')
    expect(items.find((i) => i.id === 'c')?.groupId).toBe('g1')
  })

  it('dissolves the group when deletion leaves a lone member', () => {
    useStore.getState().setItems([item('a', [0, 0], 'g1'), item('b', [1, 0], 'g1')])
    useStore.getState().deleteItem('a')
    const items = useStore.getState().items
    expect(items.find((i) => i.id === 'a')).toBeUndefined()
    expect(items.find((i) => i.id === 'b')?.groupId).toBeUndefined()
  })
})
