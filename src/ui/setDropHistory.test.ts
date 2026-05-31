import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { newGroupId } from '../state/slices/groupsSlice'
import { useStore } from '../state/store'

/**
 * Regression guard for the Sets-menu drop path (Toolbar `dropArranged`).
 *
 * The drop must be ONE undo step that restores the exact pre-drop state. The
 * earlier implementation called `pushHistory()` AND `groupItems()` (which
 * pushes again), so a single drop produced two undo entries — the first undo
 * left the set placed-but-ungrouped. This replicates the store-call sequence
 * `dropArranged` performs and asserts a single undo reverts the whole drop.
 */
function dropArranged(items: FurnitureItem[]): void {
  const st = useStore.getState()
  st.pushHistory()
  const gid = newGroupId()
  const grouped = items.map((i) => ({ ...i, groupId: gid }))
  st.setItems([...st.items, ...grouped])
  st.setSelectedItemIds(grouped.map((i) => i.id))
}

function setItem(id: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} }
}

describe('Sets drop history', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('drops a grouped set and shares one groupId', () => {
    dropArranged([setItem('a'), setItem('b')])
    const items = useStore.getState().items
    expect(items).toHaveLength(2)
    const gids = new Set(items.map((i) => i.groupId))
    expect(gids.size).toBe(1)
    expect([...gids][0]).toBeTruthy()
  })

  it('is undone by a SINGLE undo (no placed-but-ungrouped intermediate state)', () => {
    expect(useStore.getState().items).toHaveLength(0)
    dropArranged([setItem('a'), setItem('b')])
    expect(useStore.getState().items).toHaveLength(2)

    useStore.getState().undo()
    // One undo must restore the empty pre-drop state — not an ungrouped set.
    expect(useStore.getState().items).toHaveLength(0)
  })
})
