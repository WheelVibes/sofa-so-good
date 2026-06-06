import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('recentSlice', () => {
  beforeEach(() => {
    useStore.getState().clearRecent()
  })

  it('moves a placed def id to the front, newest first', () => {
    const s = useStore.getState()
    s.pushRecent('a')
    s.pushRecent('b')
    expect(useStore.getState().recentDefIds).toEqual(['b', 'a'])
  })

  it('dedupes — re-placing an item promotes it without duplicating', () => {
    const s = useStore.getState()
    s.pushRecent('a')
    s.pushRecent('b')
    s.pushRecent('a')
    expect(useStore.getState().recentDefIds).toEqual(['a', 'b'])
  })

  it('caps the list length', () => {
    const s = useStore.getState()
    for (let i = 0; i < 40; i++) s.pushRecent(`item-${i}`)
    expect(useStore.getState().recentDefIds.length).toBeLessThanOrEqual(24)
    // Newest stays at the front.
    expect(useStore.getState().recentDefIds[0]).toBe('item-39')
  })

  it('ignores empty ids', () => {
    useStore.getState().pushRecent('')
    expect(useStore.getState().recentDefIds).toEqual([])
  })

  it('addItem records the placed def in recents', () => {
    const id = useStore
      .getState()
      .addItem({ defId: 'armchair', position: [0, 0], rotation: 0, props: {} })
    expect(typeof id).toBe('string')
    expect(useStore.getState().recentDefIds[0]).toBe('armchair')
  })
})
