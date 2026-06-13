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

describe('replaceItemDef (PARITY-REPLACE)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('swaps the defId but keeps id / position / rotation / levelId / label / locked / groupId', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'bookshelf',
      position: [1.5, 2.5],
      rotation: Math.PI / 2,
      props: {},
    })
    s.renameItem(id, 'My shelf')
    // Stamp a group + lock + level to prove they survive the replace.
    useStore.setState((st) => ({
      items: st.items.map((it) =>
        it.id === id ? { ...it, groupId: 'grp-1', locked: true, levelId: 'lvl-2' } : it,
      ),
    }))

    const ok = useStore.getState().replaceItemDef(id, 'wardrobe-3door')
    expect(ok).toBe(true)

    const it = useStore.getState().items.find((i) => i.id === id)!
    expect(it.id).toBe(id)
    expect(it.defId).toBe('wardrobe-3door')
    expect(it.position).toEqual([1.5, 2.5])
    expect(it.rotation).toBe(Math.PI / 2)
    expect(it.levelId).toBe('lvl-2')
    expect(it.label).toBe('My shelf')
    expect(it.locked).toBe(true)
    expect(it.groupId).toBe('grp-1')
  })

  it('resets parametric props to the new def defaults', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'bookshelf',
      position: [0, 0],
      rotation: 0,
      props: { width: 1.4, finish: 'gloss', shelfCount: 6 },
    })
    useStore.getState().replaceItemDef(id, 'wardrobe-3door')
    const it = useStore.getState().items.find((i) => i.id === id)!
    // Old bookshelf-only props are gone; new props are the wardrobe defaults.
    expect(it.props.shelfCount).toBeUndefined()
    expect(it.props.width).toBe(1.5) // wardrobe-3door default width
    expect(typeof it.props).toBe('object')
  })

  it('drops props to {} when replacing a parametric def into a GLB def', () => {
    const s = useStore.getState()
    // dining-table-4 (parametric, tables) → pool-table-6ft (builtin GLB, tables).
    const id = s.addItem({
      defId: 'dining-table-4',
      position: [0, 0],
      rotation: 0,
      props: { width: 1.6, finish: 'gloss' },
    })
    const ok = useStore.getState().replaceItemDef(id, 'pool-table-6ft')
    expect(ok).toBe(true)
    const it = useStore.getState().items.find((i) => i.id === id)!
    expect(it.defId).toBe('pool-table-6ft')
    expect(it.props).toEqual({})
  })

  it('is a no-op for an unknown item, unknown def, or same def', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'bookshelf', position: [0, 0], rotation: 0, props: {} })
    expect(useStore.getState().replaceItemDef('does-not-exist', 'wardrobe-3door')).toBe(false)
    expect(useStore.getState().replaceItemDef(id, 'not-a-real-def')).toBe(false)
    expect(useStore.getState().replaceItemDef(id, 'bookshelf')).toBe(false)
    // defId unchanged after the failed calls.
    expect(useStore.getState().items.find((i) => i.id === id)?.defId).toBe('bookshelf')
  })

  it('pushes exactly one undo step (undo restores the previous def + props)', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'bookshelf',
      position: [0, 0],
      rotation: 0,
      props: { width: 1.1 },
    })
    useStore.getState().replaceItemDef(id, 'wardrobe-3door')
    expect(useStore.getState().items.find((i) => i.id === id)?.defId).toBe('wardrobe-3door')
    useStore.getState().undo()
    const it = useStore.getState().items.find((i) => i.id === id)!
    expect(it.defId).toBe('bookshelf')
    expect(it.props.width).toBe(1.1)
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
