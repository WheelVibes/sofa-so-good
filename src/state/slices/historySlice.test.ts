import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

describe('history slice', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('undo restores the previous items array after an addItem', () => {
    const before = s().items
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    expect(s().items.length).toBe(before.length + 1)
    s().undo()
    expect(s().items).toBe(before)
  })

  it('undo prunes a now-dangling selection (B7)', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    expect(s().selectedItemIds).toContain(id)
    s().undo() // back to before the item existed
    expect(s().items.some((i) => i.id === id)).toBe(false)
    expect(s().selectedItemIds).not.toContain(id)
    expect(s().selectedItemId).toBeNull()
  })

  it('redo replays an undone addItem', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    const afterAdd = s().items
    s().undo()
    s().redo()
    expect(s().items).toEqual(afterAdd)
  })

  it('a fresh push clears the redo stack', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().undo()
    expect(s().future.length).toBe(1)
    s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    expect(s().future.length).toBe(0)
  })

  it('coalesces rapid same-key prop edits into a single undo step', () => {
    const id = s().addItem({
      defId: 'bed-double',
      position: [0, 0],
      rotation: 0,
      props: {},
    })
    const baseDepth = s().past.length
    s().updateItemProps(id, { scale: 1.1 })
    s().updateItemProps(id, { scale: 1.2 })
    s().updateItemProps(id, { scale: 1.3 })
    // Three rapid same-prop edits → exactly one new history entry.
    expect(s().past.length).toBe(baseDepth + 1)
  })

  it('undo is a no-op on an empty past stack', () => {
    s().clearHistory()
    const snap = s().items
    s().undo()
    expect(s().items).toBe(snap)
  })

  it('toggleDoor is undoable', () => {
    s().toggleDoor('door-bedroom1')
    expect(s().doors['door-bedroom1']?.open).toBe(true)
    s().undo()
    expect(s().doors['door-bedroom1']?.open ?? false).toBe(false)
  })

  it('clearHistory drops both stacks', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().undo()
    s().clearHistory()
    expect(s().past).toEqual([])
    expect(s().future).toEqual([])
  })

  describe('jumpHistory', () => {
    it('jumps back multiple steps in one move (equivalent to N undos)', () => {
      s().clearHistory()
      const base = s().items
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
      s().addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
      // past = [base, +1, +2]; current = +3. Jump to index 0 (oldest).
      expect(s().past.length).toBe(3)
      s().jumpHistory(0)
      expect(s().items).toEqual(base)
      expect(s().past.length).toBe(0)
      // The three later states are now redoable.
      expect(s().future.length).toBe(3)
    })

    it('jumps forward into the redo stack', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const afterOne = s().items
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
      const afterTwo = s().items
      s().jumpHistory(0) // back to the very start
      expect(s().future.length).toBe(2)
      // Flat = [start, afterOne, afterTwo]; jump to index 1 → the afterOne state.
      s().jumpHistory(1)
      expect(s().items).toEqual(afterOne)
      s().jumpHistory(2)
      expect(s().items).toEqual(afterTwo)
      expect(s().future.length).toBe(0)
    })

    it('is a no-op for the current index and out-of-range indices', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const current = s().items
      const curIndex = s().past.length
      s().jumpHistory(curIndex) // already current
      expect(s().items).toBe(current)
      s().jumpHistory(999)
      expect(s().items).toBe(current)
      s().jumpHistory(-1)
      expect(s().items).toBe(current)
    })
  })
})
