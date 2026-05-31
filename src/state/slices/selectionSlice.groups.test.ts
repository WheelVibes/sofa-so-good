import { beforeEach, describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../store'

function item(id: string, groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: [0, 0], rotation: 0, groupId, props: {} }
}

describe('selectionSlice group select + drill-in', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('first click on a grouped item selects the whole group + sets activeGroupId', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1'), item('c')])
    useStore.getState().selectItemGrouped('a', {})
    expect(useStore.getState().selectedItemIds.slice().sort()).toEqual(['a', 'b'])
    expect(useStore.getState().activeGroupId).toBe('g1')
    expect(useStore.getState().selectedItemId).toBe('a')
  })

  it('second click on an already-selected member drills into just that member', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')])
    useStore.getState().selectItemGrouped('a', {}) // selects group
    useStore.getState().selectItemGrouped('a', {}) // drill-in
    expect(useStore.getState().selectedItemIds).toEqual(['a'])
    expect(useStore.getState().activeGroupId).toBe('g1') // still in group context
  })

  it('alt-click drills in directly even on the first click', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')])
    useStore.getState().selectItemGrouped('a', { alt: true })
    expect(useStore.getState().selectedItemIds).toEqual(['a'])
    expect(useStore.getState().activeGroupId).toBe('g1')
  })

  it('selecting an ungrouped item clears activeGroupId', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1'), item('c')])
    useStore.getState().selectItemGrouped('a', {})
    useStore.getState().selectItemGrouped('c', {})
    expect(useStore.getState().selectedItemIds).toEqual(['c'])
    expect(useStore.getState().activeGroupId).toBeNull()
  })

  it('clearActiveGroup() drops the group context', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')])
    useStore.getState().selectItemGrouped('a', {})
    useStore.getState().clearActiveGroup()
    expect(useStore.getState().activeGroupId).toBeNull()
  })

  it('selectItem(null) also clears activeGroupId (deselect-all path)', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')])
    useStore.getState().selectItemGrouped('a', {})
    useStore.getState().selectItem(null)
    expect(useStore.getState().activeGroupId).toBeNull()
  })
})
