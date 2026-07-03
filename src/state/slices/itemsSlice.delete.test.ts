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

  it('deleteItem(id, { silent: true }) suppresses the per-item toast', () => {
    const id = seedItem()
    const before = s().notifications.length

    s().deleteItem(id, { silent: true })

    expect(s().items).toHaveLength(0)
    expect(s().notifications.length).toBe(before)
  })

  it('clearRoom shows exactly one toast with a working Undo (no duplicate)', () => {
    const a = seedItem()
    const b = seedItem()
    expect(s().items).toHaveLength(2)

    // Emulate FinishPicker's clearRoom: one pushHistory, silent per-item
    // deletes (skipping their own history push), then its own single
    // summary toast with an Undo action.
    s().pushHistory()
    s().deleteItem(a, { silent: true, skipHistoryPush: true })
    s().deleteItem(b, { silent: true, skipHistoryPush: true })
    s().notify.start({
      title: 'Cleared 2 items from this room',
      kind: 'success',
      actionLabel: 'Undo',
      onAction: () => s().undo(),
    })

    expect(s().items).toHaveLength(0)
    const summaryToasts = s().notifications.filter((n) => n.title.startsWith('Cleared'))
    expect(summaryToasts).toHaveLength(1)
    expect(summaryToasts[0]?.actionLabel).toBe('Undo')

    summaryToasts[0]?.onAction?.()
    expect(s().items).toHaveLength(2)
  })

  it('clearRoom pushes exactly one history step (no double-push)', () => {
    const a = seedItem()
    const b = seedItem()
    const pastBefore = s().past.length

    // Emulate FinishPicker's clearRoom sequence: one explicit pushHistory()
    // followed by a silent, history-skipping per-item delete loop. The loop
    // must NOT add a second entry on top of the explicit pushHistory() call.
    s().pushHistory()
    s().deleteItem(a, { silent: true, skipHistoryPush: true })
    s().deleteItem(b, { silent: true, skipHistoryPush: true })

    expect(s().items).toHaveLength(0)
    expect(s().past.length).toBe(pastBefore + 1)

    // A single undo() reverts the whole clear in one step.
    s().undo()
    expect(s().items).toHaveLength(2)
  })
})
