import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('applyStyleToAll', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it("copies the source item's props to all others of the same defId", () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'dining-chair', position: [2, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'bed-double', position: [5, 5], rotation: 0, props: { finish: 'wood' } })
    // Style the source.
    s.updateItemProps(a, { finish: 'mat:floor-wood-walnut' })

    const n = useStore.getState().applyStyleToAll(a)
    expect(n).toBe(2)
    const chairs = useStore.getState().items.filter((i) => i.defId === 'dining-chair')
    expect(chairs.every((c) => c.props.finish === 'mat:floor-wood-walnut')).toBe(true)
    // The bed (different defId) is untouched.
    const bed = useStore.getState().items.find((i) => i.defId === 'bed-double')
    expect(bed?.props.finish).toBe('wood')
  })

  it('skips locked targets and returns the count restyled', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    s.toggleLock(b)
    s.updateItemProps(a, { finish: 'gloss' })
    const n = useStore.getState().applyStyleToAll(a)
    expect(n).toBe(0)
    expect(useStore.getState().items.find((i) => i.id === b)?.props.finish).toBeUndefined()
  })

  it('returns 0 when there are no other items of the type', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    expect(useStore.getState().applyStyleToAll(a)).toBe(0)
  })
})

describe('renameItem', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('sets and clears a custom label (blank trims to undefined)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.renameItem(id, '  Mom’s chair  ')
    expect(useStore.getState().items.find((i) => i.id === id)?.label).toBe('Mom’s chair')
    s.renameItem(id, '   ')
    expect(useStore.getState().items.find((i) => i.id === id)?.label).toBeUndefined()
  })
})

describe('setAllLocked', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('locks then unlocks every item', () => {
    const s = useStore.getState()
    s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'bed-double', position: [5, 5], rotation: 0, props: {} })
    s.setAllLocked(true)
    expect(useStore.getState().items.every((i) => i.locked)).toBe(true)
    s.setAllLocked(false)
    expect(useStore.getState().items.some((i) => i.locked)).toBe(false)
  })
})

describe('addItem level stamping (F13/ML5)', () => {
  it('stamps levelId from an upper-storey room editor; ground editor leaves it unset', () => {
    useStore.getState().__resetForTest()
    useStore.setState({
      floorPlan: {
        ...useStore.getState().floorPlan,
        id: 'ml5-plan',
        rooms: [{ id: 'g-liv', name: 'Living', origin: [0.2, 0.2], width: 4, depth: 4 }],
        upperLevels: [
          {
            id: 'lvl-2',
            name: 'Upper',
            elevation: 2.9,
            walls: [],
            openings: [],
            rooms: [{ id: 'up-bed', name: 'Bedroom', origin: [0.2, 0.2], width: 4, depth: 4 }],
          },
        ],
      },
    } as never)
    useStore.getState().enterRoomEditor('up-bed')
    const upId = useStore
      .getState()
      .addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    expect(useStore.getState().items.find((i) => i.id === upId)?.levelId).toBe('lvl-2')
    useStore.getState().enterRoomEditor('g-liv')
    const gId = useStore
      .getState()
      .addItem({ defId: 'sofa-3seat', position: [2, 2], rotation: 0, props: {} })
    expect(useStore.getState().items.find((i) => i.id === gId)?.levelId).toBeUndefined()
    // An explicit levelId (duplicate/paste of an upper item) always wins.
    useStore.getState().exitRoomEditor?.()
    const dupId = useStore
      .getState()
      .addItem({ defId: 'bed-double', position: [1, 2], rotation: 0, levelId: 'lvl-2', props: {} })
    expect(useStore.getState().items.find((i) => i.id === dupId)?.levelId).toBe('lvl-2')
  })
})
