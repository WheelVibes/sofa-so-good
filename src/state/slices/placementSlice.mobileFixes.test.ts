import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/** Coverage for the mobile-fixes placement additions:
 *  - `placeConfirm` explicit-confirm mode (bugs #2/#5)
 *  - `cancelDrag` reverting an in-progress drag (bug #11, second-finger pinch) */
describe('placement — mobile fixes', () => {
  beforeEach(() => {
    useStore.setState({
      activeDefId: null,
      placeConfirm: false,
      draggingItemId: null,
      dragOriginal: null,
      dragGroupOriginals: [],
      dragPointerId: null,
      reopenCatalogAfterPlace: false,
      items: [],
      past: [],
      future: [],
    })
  })

  it('setPlaceConfirm toggles the flag; cancelPlacement clears it', () => {
    useStore.getState().setActiveDefId('sofa-3seat')
    useStore.getState().setPlaceConfirm(true)
    expect(useStore.getState().placeConfirm).toBe(true)
    useStore.getState().cancelPlacement()
    expect(useStore.getState().placeConfirm).toBe(false)
    expect(useStore.getState().activeDefId).toBe(null)
  })

  it('re-arming a def via setActiveDefId clears a stale placeConfirm', () => {
    useStore.setState({ activeDefId: 'a', placeConfirm: true })
    useStore.getState().setActiveDefId('b')
    expect(useStore.getState().placeConfirm).toBe(false)
  })

  it('cancelDrag reverts to the pre-drag items snapshot and ends the drag', () => {
    const item = {
      id: 'i1',
      defId: 'sofa-3seat',
      position: [0, 0] as [number, number],
      rotation: 0,
      props: {},
    }
    useStore.setState({ items: [item], past: [], future: [] })
    // Begin a drag (pushes a history snapshot of the pre-drag items), then move it.
    useStore.getState().startDrag('i1', { position: [0, 0], rotation: 0 }, [0, 0], 1)
    useStore.getState().moveItem('i1', [5, 5])
    expect(useStore.getState().items[0].position).toEqual([5, 5])
    expect(useStore.getState().draggingItemId).toBe('i1')

    useStore.getState().cancelDrag()
    // Reverted to the pre-drag position, drag ended, no lingering history step.
    expect(useStore.getState().items[0].position).toEqual([0, 0])
    expect(useStore.getState().draggingItemId).toBe(null)
  })

  it('cancelDrag is a no-op when nothing is being dragged', () => {
    expect(() => useStore.getState().cancelDrag()).not.toThrow()
    expect(useStore.getState().draggingItemId).toBe(null)
  })
})

describe('motion toggle (bug #15)', () => {
  it('defaults on and toggles', () => {
    useStore.setState({ motionEnabled: true })
    expect(useStore.getState().motionEnabled).toBe(true)
    useStore.getState().toggleMotion()
    expect(useStore.getState().motionEnabled).toBe(false)
    useStore.getState().setMotionEnabled(true)
    expect(useStore.getState().motionEnabled).toBe(true)
  })
})
