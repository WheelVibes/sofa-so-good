import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

/** Seed one real placed item via the addItem path so history has a genuine
 *  baseline to undo back to, and return its id. */
function seedItem(): string {
  return s().addItem({ defId: 'sofa-2seat', position: [0, 0], rotation: 0, props: {} })
}

describe('P30 delete emits an Undo toast', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('toasts "deleted" with an Undo action wired to undo()', () => {
    const id = seedItem()
    expect(s().items).toHaveLength(1)

    s().deleteItem(id)
    expect(s().items).toHaveLength(0)

    const toast = s().notifications.at(-1)
    expect(toast?.kind).toBe('success')
    expect(toast?.actionLabel).toBe('Undo')

    toast?.onAction?.()
    expect(s().items).toHaveLength(1)
    expect(s().items[0]?.id).toBe(id)
  })

  it('behaves identically in Pro mode', () => {
    s().setUiMode('pro')
    s().reresolveFeatureFlags()

    const id = seedItem()
    s().deleteItem(id)
    expect(s().items).toHaveLength(0)

    const toast = s().notifications.at(-1)
    expect(toast?.kind).toBe('success')
    expect(toast?.actionLabel).toBe('Undo')

    toast?.onAction?.()
    expect(s().items).toHaveLength(1)
  })

  it('a multi-select delete loop surfaces a single Undo toast (de-dupe)', () => {
    const a = seedItem()
    const b = seedItem()
    expect(s().items).toHaveLength(2)

    // Emulate the multi-select delete callers (App/MultiSelectPanel/ContextMenu):
    // deleteItem is called once per id.
    s().deleteItem(a)
    s().deleteItem(b)
    expect(s().items).toHaveLength(0)

    // Identical toasts de-dupe → exactly one "Item deleted" success toast.
    const deleteToasts = s().notifications.filter(
      (n) => n.kind === 'success' && n.actionLabel === 'Undo',
    )
    expect(deleteToasts).toHaveLength(1)

    // One undo reverts the whole coalesced batch delete.
    s().undo()
    expect(s().items).toHaveLength(2)
  })
})
