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

  it('is undoable — one history entry per rename (BUG-008)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const before = useStore.getState().past.length
    useStore.getState().renameItem(id, 'Reading chair')
    expect(useStore.getState().past.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().items.find((i) => i.id === id)?.label).toBeUndefined()
  })

  it('does not push history when the label is unchanged (no-op rename)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    useStore.getState().renameItem(id, 'Chair')
    const after = useStore.getState().past.length
    useStore.getState().renameItem(id, '  Chair  ') // trims to same value
    expect(useStore.getState().past.length).toBe(after)
  })
})

describe('setItemMeta (ITEM-META)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('trims fields, sets meta, and omits the whole object once empty', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, {
      url: '  https://example.com/chair  ',
      description: '  A nice chair  ',
      remarks: '  existing — retain  ',
    })
    const item = useStore.getState().items.find((i) => i.id === id)
    expect(item?.meta).toEqual({
      url: 'https://example.com/chair',
      description: 'A nice chair',
      remarks: 'existing — retain',
    })
    // Clearing every field back to blank drops the whole `meta` object.
    s.setItemMeta(id, { url: '  ', description: '', remarks: '' })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta).toBeUndefined()
  })

  it('omits an empty field from the object while keeping the others', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, { remarks: 'client to purchase' })
    const item = useStore.getState().items.find((i) => i.id === id)
    expect(item?.meta?.remarks).toBe('client to purchase')
    expect(item?.meta?.url).toBeUndefined()
    expect(item?.meta?.description).toBeUndefined()
  })

  it('sets brand/model/supplier/price (FF&E spec-book fields), trimmed', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, {
      price: 249,
      brand: '  Acme  ',
      model: '  X-100  ',
      supplier: '  Acme Direct  ',
    })
    const item = useStore.getState().items.find((i) => i.id === id)
    expect(item?.meta).toEqual({
      price: 249,
      brand: 'Acme',
      model: 'X-100',
      supplier: 'Acme Direct',
    })
  })

  it('rejects a negative or NaN price (omits it rather than storing garbage)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, { price: -5, remarks: 'note' })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBeUndefined()
    s.setItemMeta(id, { price: Number.NaN })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBeUndefined()
  })

  it('accepts a zero price (a legitimate "already owned, no cost" override)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, { price: 0 })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBe(0)
  })

  it('clearing price back to undefined restores the derived/catalog price', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, { price: 500 })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBe(500)
    s.setItemMeta(id, { price: undefined })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.price).toBeUndefined()
  })

  it('trims custom field keys/values and drops blank-key/blank-value entries', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, {
      custom: [
        { key: '  Fabric  ', value: '  Linen  ' },
        { key: '  ', value: 'dropped: blank key' },
        { key: 'dropped: blank value', value: '   ' },
        { key: 'Warranty', value: '2 years' },
      ],
    })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toEqual([
      { key: 'Fabric', value: 'Linen' },
      { key: 'Warranty', value: '2 years' },
    ])
  })

  it('caps custom entries at CUSTOM_META_MAX_ENTRIES (earliest entries win)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const many = Array.from({ length: 25 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
    s.setItemMeta(id, { custom: many })
    const custom = useStore.getState().items.find((i) => i.id === id)?.meta?.custom
    expect(custom).toHaveLength(20)
    expect(custom?.[0]).toEqual({ key: 'k0', value: 'v0' })
    expect(custom?.[19]).toEqual({ key: 'k19', value: 'v19' })
  })

  it('truncates an over-long custom key/value rather than dropping the entry', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const longKey = 'k'.repeat(60)
    const longValue = 'v'.repeat(600)
    s.setItemMeta(id, { custom: [{ key: longKey, value: longValue }] })
    const entry = useStore.getState().items.find((i) => i.id === id)?.meta?.custom?.[0]
    expect(entry?.key.length).toBe(40)
    expect(entry?.value.length).toBe(500)
  })

  it('allows duplicate keys in the model (last-one-wins is a CSV/report concern, not a store one)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, {
      custom: [
        { key: 'Color', value: 'Blue' },
        { key: 'Color', value: 'Green' },
      ],
    })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toEqual([
      { key: 'Color', value: 'Blue' },
      { key: 'Color', value: 'Green' },
    ])
  })

  it('an empty custom array is omitted from meta entirely (keeps saves lean)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.setItemMeta(id, { remarks: 'note', custom: [] })
    expect(useStore.getState().items.find((i) => i.id === id)?.meta?.custom).toBeUndefined()
  })

  it('is undoable — one history entry per meta edit, coalesced per item', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const before = useStore.getState().past.length
    useStore.getState().setItemMeta(id, { remarks: 'note one' })
    expect(useStore.getState().past.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().items.find((i) => i.id === id)?.meta).toBeUndefined()
  })

  it('does not push history when the meta is unchanged (no-op)', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    useStore.getState().setItemMeta(id, { remarks: 'note' })
    const after = useStore.getState().past.length
    useStore.getState().setItemMeta(id, { remarks: '  note  ' }) // trims to same value
    expect(useStore.getState().past.length).toBe(after)
  })

  it('never touches props/geometry — only the meta field changes', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'dining-chair',
      position: [1, 2],
      rotation: 0.5,
      props: { finish: 'wood' },
    })
    s.setItemMeta(id, { description: 'a note' })
    const item = useStore.getState().items.find((i) => i.id === id)
    expect(item?.props).toEqual({ finish: 'wood' })
    expect(item?.position).toEqual([1, 2])
    expect(item?.rotation).toBe(0.5)
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

describe('updateItemProps key clearing (BUG: "Turn off light source" never works)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('removes a key whose patch value is explicitly undefined', () => {
    const s = useStore.getState()
    const id = s.addItem({ defId: 'sofa-3seat', position: [0, 0], rotation: 0, props: {} })
    useStore.getState().updateItemProps(id, { lightOn: 'yes' })
    expect(useStore.getState().items.find((i) => i.id === id)?.props.lightOn).toBe('yes')
    useStore.getState().updateItemProps(id, { lightOn: undefined })
    const props = useStore.getState().items.find((i) => i.id === id)?.props ?? {}
    expect('lightOn' in props).toBe(false)
  })

  it('keeps other keys intact while clearing one', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'sofa-3seat',
      position: [0, 0],
      rotation: 0,
      props: { finish: 'gloss', lightOn: 'yes' },
    })
    useStore.getState().updateItemProps(id, { lightOn: undefined })
    const props = useStore.getState().items.find((i) => i.id === id)?.props ?? {}
    expect(props.finish).toBe('gloss')
    expect('lightOn' in props).toBe(false)
  })

  it('clearing is undoable (undo restores the key)', () => {
    const s = useStore.getState()
    const id = s.addItem({
      defId: 'sofa-3seat',
      position: [0, 0],
      rotation: 0,
      props: { lightOn: 'yes' },
    })
    useStore.getState().updateItemProps(id, { lightOn: undefined })
    useStore.getState().undo()
    expect(useStore.getState().items.find((i) => i.id === id)?.props.lightOn).toBe('yes')
  })
})

describe('updateManyItemProps (bulk recolour, one undo step)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('merges props into every listed item and leaves others untouched', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    const c = s.addItem({ defId: 'bed-double', position: [5, 5], rotation: 0, props: {} })
    useStore.getState().updateManyItemProps([a, b], { tint: '#ff0000' })
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    expect(byId.get(a)?.props.tint).toBe('#ff0000')
    expect(byId.get(b)?.props.tint).toBe('#ff0000')
    expect(byId.get(c)?.props.tint).toBeUndefined()
  })

  it('is a single undo step for the whole batch', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    useStore.getState().updateManyItemProps([a, b], { tint: '#00ff00' })
    useStore.getState().undo()
    const byId = new Map(useStore.getState().items.map((i) => [i.id, i]))
    // One undo reverts BOTH items' tint.
    expect(byId.get(a)?.props.tint).toBeUndefined()
    expect(byId.get(b)?.props.tint).toBeUndefined()
  })

  it('clears a tint when passed an empty string', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    useStore.getState().updateManyItemProps([a], { tint: '#123456' })
    useStore.getState().updateManyItemProps([a], { tint: '' })
    expect(useStore.getState().items.find((i) => i.id === a)?.props.tint).toBe('')
  })

  it('is a no-op with an empty id list (no history entry)', () => {
    const s = useStore.getState()
    s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const before = useStore.getState().items
    useStore.getState().updateManyItemProps([], { tint: '#fff' })
    expect(useStore.getState().items).toBe(before)
  })
})
