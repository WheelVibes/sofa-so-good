/**
 * PC-NUDGE-UNDO: dropping a furniture set (a batch of items committed as one
 * group) must be exactly ONE undo entry — `dropArranged` pushes history once then
 * appends every item via a single `setItems`, so one undo removes the whole set.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { dropBuiltinSet } from './arrangeActions'

function s() {
  return useStore.getState()
}

describe('arrangeActions set drop — single clean undo entry', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('dropBuiltinSet adds the whole set in one undo step that fully reverts', () => {
    const before = s().items
    s().clearHistory()
    dropBuiltinSet('dining-4')
    expect(s().past.length).toBe(1) // batch commit, not per-item
    expect(s().items.length).toBeGreaterThan(before.length)
    // All copies share one group and one undo removes them all at once.
    s().undo()
    expect(s().items).toBe(before)
  })

  it('an unknown set id is a no-op (no history entry)', () => {
    s().clearHistory()
    dropBuiltinSet('does-not-exist')
    expect(s().past.length).toBe(0)
  })
})
