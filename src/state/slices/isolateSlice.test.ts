import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

const add = (defId: string) =>
  useStore.getState().addItem({ defId, position: [0, 0], rotation: 0, props: {} })

describe('isolateSlice — toggleIsolateSelection (FEAT-C)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('is off by default', () => {
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('turns on when something is selected', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
  })

  it('is a no-op when nothing is selected — isolating an empty selection would dim the whole room to no purpose', () => {
    expect(useStore.getState().selectedItemIds).toEqual([])
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('toggles back off on a second call', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('setIsolateActive sets state directly', () => {
    useStore.getState().setIsolateActive(true)
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().setIsolateActive(false)
    expect(useStore.getState().isolateActive).toBe(false)
  })
})

describe('isolateSlice — auto-clear (FEAT-C)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('clears when the selection changes to a different item (selectItem)', () => {
    const a = add('bed-double')
    const b = add('dining-chair')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().selectItem(b)
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('clears when the selection is cleared (selectItem(null))', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    useStore.getState().selectItem(null)
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('clears when the multi-selection changes (setSelectedItemIds)', () => {
    const a = add('bed-double')
    const b = add('dining-chair')
    useStore.getState().setSelectedItemIds([a, b])
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().setSelectedItemIds([a])
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('clears when a different item is added to the selection (toggleSelectedItem)', () => {
    const a = add('bed-double')
    const b = add('dining-chair')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    useStore.getState().toggleSelectedItem(b)
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('clears when selecting a room (selectRoom)', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    useStore.getState().selectRoom('room-1')
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('does NOT clear on a no-op re-click of the same already-selected item (content-equality guard)', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    // Re-selecting the same id produces a fresh `[a]` array reference but the
    // same contents — must not spuriously drop isolate.
    useStore.getState().selectItem(a)
    expect(useStore.getState().isolateActive).toBe(true)
  })

  it('clears on exiting the room editor (exitRoomEditor clears selection)', () => {
    const a = add('bed-double')
    useStore.getState().enterRoomEditor('bedroom1')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().exitRoomEditor()
    expect(useStore.getState().isolateActive).toBe(false)
    expect(useStore.getState().selectedItemIds).toEqual([])
  })

  it('clears on entering a fresh room editor (enterRoomEditor also clears selection)', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    expect(useStore.getState().isolateActive).toBe(true)
    useStore.getState().enterRoomEditor('bedroom1')
    expect(useStore.getState().isolateActive).toBe(false)
  })

  it('does not clear on unrelated state changes that leave selection untouched', () => {
    const a = add('bed-double')
    useStore.getState().selectItem(a)
    useStore.getState().toggleIsolateSelection()
    useStore.getState().moveItem(a, [1, 1])
    expect(useStore.getState().isolateActive).toBe(true)
  })
})
