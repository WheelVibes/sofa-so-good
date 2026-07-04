import { beforeEach, describe, expect, it } from 'vitest'
import { isActiveDragPointer } from '../../scene/dragHelpers'
import { useStore } from '../store'

/**
 * BUG-1 (multi-touch furniture drag hijack): `startDrag` records the
 * initiating pointer's `pointerId` on the store so `DragController`'s
 * window-level pointermove/up/cancel listeners can gate on it via
 * `isActiveDragPointer` — a second finger's independent pointer stream must
 * never drive or end a drag it didn't start. `DragController` itself is an
 * R3F component (hard to mount headless), so this exercises the store-level
 * contract it reads from directly, plus the pure gate it calls.
 */
describe('placementSlice — drag pointerId tracking (BUG-1)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('startDrag records the initiating pointerId', () => {
    useStore.getState().startDrag('item-1', { position: [0, 0], rotation: 0 }, [0, 0], 42)
    expect(useStore.getState().draggingItemId).toBe('item-1')
    expect(useStore.getState().dragPointerId).toBe(42)
  })

  it('endDrag clears the recorded pointerId', () => {
    useStore.getState().startDrag('item-1', { position: [0, 0], rotation: 0 }, [0, 0], 42)
    useStore.getState().endDrag()
    expect(useStore.getState().draggingItemId).toBeNull()
    expect(useStore.getState().dragPointerId).toBeNull()
  })

  it('a second finger (different pointerId) is rejected by the gate the controller reads', () => {
    useStore.getState().startDrag('item-1', { position: [0, 0], rotation: 0 }, [0, 0], 1)
    const { dragPointerId } = useStore.getState()
    // Finger 1's own move stream drives the drag.
    expect(isActiveDragPointer(dragPointerId, 1)).toBe(true)
    // Finger 2 rests on the screen mid-drag — its independent pointermove
    // stream (pointerId 2) must be ignored, not hijack the drag.
    expect(isActiveDragPointer(dragPointerId, 2)).toBe(false)
  })

  it('only the initiating pointer can end the drag; the drag survives a second finger releasing', () => {
    useStore.getState().startDrag('item-1', { position: [0, 0], rotation: 0 }, [0, 0], 1)
    // Simulate the controller's onUp gate: pointerup from finger 2 is ignored.
    expect(isActiveDragPointer(useStore.getState().dragPointerId, 2)).toBe(false)
    expect(useStore.getState().draggingItemId).toBe('item-1') // drag is still active
    // Finger 1's own pointerup is accepted and ends the drag.
    expect(isActiveDragPointer(useStore.getState().dragPointerId, 1)).toBe(true)
    useStore.getState().endDrag()
    expect(useStore.getState().draggingItemId).toBeNull()
  })

  it('starting a new drag overwrites the previous pointerId (fresh gesture)', () => {
    useStore.getState().startDrag('item-1', { position: [0, 0], rotation: 0 }, [0, 0], 5)
    useStore.getState().endDrag()
    useStore.getState().startDrag('item-2', { position: [1, 1], rotation: 0 }, [0, 0], 6)
    expect(useStore.getState().draggingItemId).toBe('item-2')
    expect(useStore.getState().dragPointerId).toBe(6)
  })
})
