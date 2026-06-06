import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

const add = (defId: string) =>
  useStore.getState().addItem({ defId, position: [0, 0], rotation: 0, props: {} })

describe('selectionSlice hidden items', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('toggleItemHidden adds then removes a single id', () => {
    const a = add('bed-double')
    useStore.getState().toggleItemHidden(a)
    expect(useStore.getState().hiddenItemIds).toContain(a)
    useStore.getState().toggleItemHidden(a)
    expect(useStore.getState().hiddenItemIds).not.toContain(a)
  })

  it('setItemsHidden hides + reveals a set without duplicating ids', () => {
    const a = add('bed-double')
    const b = add('dining-chair')
    useStore.getState().toggleItemHidden(a) // a already hidden
    useStore.getState().setItemsHidden([a, b], true)
    const hidden = useStore.getState().hiddenItemIds
    expect(hidden).toContain(a)
    expect(hidden).toContain(b)
    expect(hidden.filter((id) => id === a)).toHaveLength(1) // no dupes
    useStore.getState().setItemsHidden([a, b], false)
    expect(useStore.getState().hiddenItemIds).toEqual([])
  })

  it('showAllItems clears everything', () => {
    const a = add('bed-double')
    useStore.getState().setItemsHidden([a], true)
    useStore.getState().showAllItems()
    expect(useStore.getState().hiddenItemIds).toEqual([])
  })

  it('deleting a hidden item drops its stale id from hiddenItemIds', () => {
    const a = add('bed-double')
    const b = add('dining-chair')
    useStore.getState().setItemsHidden([a, b], true)
    useStore.getState().deleteItem(a)
    expect(useStore.getState().hiddenItemIds).toEqual([b])
  })
})
