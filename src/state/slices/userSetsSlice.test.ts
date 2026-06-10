import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { captureSetItems } from './userSetsSlice'

describe('captureSetItems', () => {
  it('stores offsets relative to the selection centroid', () => {
    const items = [
      {
        defId: 'a',
        position: [2, 2] as [number, number],
        rotation: 0,
        props: {} as Record<string, number>,
      },
      { defId: 'b', position: [4, 2] as [number, number], rotation: 1, props: { x: 1 } },
    ]
    const out = captureSetItems(items)
    // Centroid is (3,2); offsets are symmetric around it.
    expect(out[0]).toMatchObject({ defId: 'a', dx: -1, dz: 0, rotation: 0 })
    expect(out[1]).toMatchObject({ defId: 'b', dx: 1, dz: 0, rotation: 1 })
    expect(out[1].props).toEqual({ x: 1 })
  })

  it('returns empty for no items', () => {
    expect(captureSetItems([])).toEqual([])
  })
})

describe('userSetsSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('saves the current selection as a named set', () => {
    const a = useStore
      .getState()
      .addItem({ defId: 'bed-single', position: [1, 1], rotation: 0, props: {} })
    const b = useStore
      .getState()
      .addItem({ defId: 'bed-single', position: [3, 1], rotation: 0, props: {} })
    useStore.getState().setSelectedItemIds([a, b])
    const id = useStore.getState().saveSelectionAsSet('Test set')
    expect(id).not.toBeNull()
    const sets = useStore.getState().userSets
    expect(sets.at(-1)?.name).toBe('Test set')
    expect(sets.at(-1)?.items).toHaveLength(2)
  })

  it('returns null when nothing is selected', () => {
    useStore.getState().setSelectedItemIds([])
    expect(useStore.getState().saveSelectionAsSet('Empty')).toBeNull()
  })

  it('deletes a saved set', () => {
    const a = useStore
      .getState()
      .addItem({ defId: 'bed-single', position: [1, 1], rotation: 0, props: {} })
    useStore.getState().setSelectedItemIds([a])
    const id = useStore.getState().saveSelectionAsSet('Doomed')!
    useStore.getState().deleteUserSet(id)
    expect(useStore.getState().userSets.find((u) => u.id === id)).toBeUndefined()
  })
})
