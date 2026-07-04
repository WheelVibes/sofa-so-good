import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../store'

function item(id: string, pos: [number, number], groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: pos, rotation: 0, groupId, props: {} }
}

/**
 * FEAT-B: Alt-drag duplicate. `startDrag`'s optional `duplicateSourceIds`
 * arms `dragDuplicatePending`; `DragController`'s first pointermove resolves
 * it via `resolveDragDuplicate`, which clones the source(s) IN PLACE, swaps
 * the live drag onto the copy, and leaves the original untouched. Exercises
 * the store contract directly (DragController itself is an R3F component).
 */
describe('placementSlice — Alt-drag duplicate (FEAT-B)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('startDrag without duplicateSourceIds is a normal (non-duplicating) drag', () => {
    useStore.getState().setItems([item('a', [1, 1])])
    useStore.getState().startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1)
    expect(useStore.getState().dragDuplicatePending).toBe(false)
    useStore.getState().resolveDragDuplicate()
    expect(useStore.getState().items).toHaveLength(1)
    expect(useStore.getState().draggingItemId).toBe('a')
  })

  it('startDrag with duplicateSourceIds arms dragDuplicatePending, unresolved until called', () => {
    useStore.getState().setItems([item('a', [1, 1])])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, undefined, ['a'])
    expect(useStore.getState().dragDuplicatePending).toBe(true)
    expect(useStore.getState().dragIsDuplicate).toBe(false)
    // A plain click that never moves never calls resolveDragDuplicate — no
    // pointermove fires — so nothing is cloned.
    expect(useStore.getState().items).toHaveLength(1)
  })

  it('resolveDragDuplicate clones the single source in place and drags the copy', () => {
    useStore.getState().setItems([item('a', [1, 1])])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, undefined, ['a'])
    useStore.getState().resolveDragDuplicate()
    const s = useStore.getState()
    expect(s.items).toHaveLength(2)
    expect(s.dragDuplicatePending).toBe(false)
    expect(s.dragIsDuplicate).toBe(true)
    // The original stays exactly where it was.
    expect(s.items.find((i) => i.id === 'a')?.position).toEqual([1, 1])
    // The drag now targets the CLONE, not the original.
    expect(s.draggingItemId).not.toBe('a')
    const clone = s.items.find((i) => i.id === s.draggingItemId)
    expect(clone?.position).toEqual([1, 1])
    expect(s.selectedItemIds).toEqual([s.draggingItemId])
  })

  it('a single-item duplicate drops the source groupId (matches the Duplicate button)', () => {
    useStore.getState().setItems([item('a', [1, 1], 'g1'), item('b', [5, 5], 'g1')])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, undefined, ['a'])
    useStore.getState().resolveDragDuplicate()
    const s = useStore.getState()
    const clone = s.items.find((i) => i.id === s.draggingItemId)
    expect(clone?.groupId).toBeUndefined()
    // The original (and its group sibling) are untouched.
    expect(s.items.find((i) => i.id === 'a')?.groupId).toBe('g1')
    expect(s.items.find((i) => i.id === 'b')?.groupId).toBe('g1')
  })

  it('a multi-select group duplicate re-groups the copies under a fresh id', () => {
    const groupOriginals = [
      { id: 'a', position: [1, 1] as [number, number], rotation: 0 },
      { id: 'b', position: [5, 5] as [number, number], rotation: 0 },
    ]
    useStore.getState().setItems([item('a', [1, 1], 'g1'), item('b', [5, 5], 'g1')])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, groupOriginals, ['a', 'b'])
    useStore.getState().resolveDragDuplicate()
    const s = useStore.getState()
    expect(s.items).toHaveLength(4)
    const cloneA = s.items.find((i) => i.id === s.draggingItemId)!
    const cloneB = s.items.find((i) => i.position[0] === 5 && i.position[1] === 5 && i.id !== 'b')!
    expect(cloneA.groupId).toBeDefined()
    expect(cloneA.groupId).toBe(cloneB.groupId)
    expect(cloneA.groupId).not.toBe('g1')
    // dragGroupOriginals now reference the clone ids, not the sources.
    expect(s.dragGroupOriginals.map((o) => o.id).sort()).toEqual([cloneA.id, cloneB.id].sort())
    expect(s.selectedItemIds.sort()).toEqual([cloneA.id, cloneB.id].sort())
  })

  it('a mixed/ungrouped multi-select duplicate drops the group entirely', () => {
    const groupOriginals = [
      { id: 'a', position: [1, 1] as [number, number], rotation: 0 },
      { id: 'b', position: [5, 5] as [number, number], rotation: 0 },
    ]
    useStore.getState().setItems([item('a', [1, 1], 'g1'), item('b', [5, 5])])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, groupOriginals, ['a', 'b'])
    useStore.getState().resolveDragDuplicate()
    const s = useStore.getState()
    for (const it of s.items) {
      if (it.id !== 'a' && it.id !== 'b') expect(it.groupId).toBeUndefined()
    }
  })

  it('endDrag clears the duplicate-tracking fields', () => {
    useStore.getState().setItems([item('a', [1, 1])])
    useStore
      .getState()
      .startDrag('a', { position: [1, 1], rotation: 0 }, [0, 0], 1, undefined, ['a'])
    useStore.getState().resolveDragDuplicate()
    useStore.getState().endDrag()
    const s = useStore.getState()
    expect(s.dragDuplicatePending).toBe(false)
    expect(s.dragIsDuplicate).toBe(false)
    expect(s.dragDuplicateSourceIds).toEqual([])
  })
})
