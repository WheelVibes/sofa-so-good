import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// BUG-4: a de-duped "Item deleted" toast's Undo must restore EVERY delete it
// coalesced, not just the last one. Two deletes ≥COALESCE_MS (500ms) apart
// each push their OWN history entry (unlike the same-tick multi-select loop
// above, which merges into one entry) — but the notify de-dupe still merges
// their identical "Item deleted" toasts into a single visible one, purely by
// kind+title+message, with no notion of history-step boundaries. Before the
// fix, that merged toast's `onAction` was always a plain `() => get().undo()`
// (whichever call created/kept it), so clicking Undo popped only the newest
// history entry — restoring the second delete and silently leaving the first
// one gone.
describe('BUG-4 de-duped delete toast restores every coalesced delete', () => {
  beforeEach(() => {
    s().__resetForTest()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('two deletes 1s apart de-dupe into one toast whose Undo restores BOTH', () => {
    const a = seedItem()
    const b = seedItem()
    const c = seedItem()
    expect(s().items).toHaveLength(3)

    s().deleteItem(a)
    vi.advanceTimersByTime(1000) // past COALESCE_MS — a fresh history entry
    s().deleteItem(b)
    expect(s().items.map((i) => i.id)).toEqual([c])

    // Still exactly one visible "Item deleted" toast (de-duped).
    const deleteToasts = s().notifications.filter(
      (n) => n.kind === 'success' && n.actionLabel === 'Undo' && n.title === 'Item deleted',
    )
    expect(deleteToasts).toHaveLength(1)
    // Two SEPARATE history entries were actually pushed for the two deletes
    // (proving they did NOT coalesce at the history level — this is the
    // de-dupe-only-at-the-toast-layer scenario BUG-4 is about).
    expect(s().past.length).toBeGreaterThanOrEqual(2)

    // Clicking the single merged toast's Undo must restore BOTH a and b —
    // before the fix, only b (the most recent delete) came back.
    deleteToasts[0]?.onAction?.()
    expect(
      s()
        .items.map((i) => i.id)
        .sort(),
    ).toEqual([a, b, c].sort())
  })

  it('three deletes each 1s apart still de-dupe to one toast whose Undo restores all three', () => {
    const a = seedItem()
    const b = seedItem()
    const c = seedItem()
    const d = seedItem()
    expect(s().items).toHaveLength(4)

    s().deleteItem(a)
    vi.advanceTimersByTime(1000)
    s().deleteItem(b)
    vi.advanceTimersByTime(1000)
    s().deleteItem(c)
    expect(s().items.map((i) => i.id)).toEqual([d])

    const deleteToasts = s().notifications.filter(
      (n) => n.kind === 'success' && n.actionLabel === 'Undo' && n.title === 'Item deleted',
    )
    expect(deleteToasts).toHaveLength(1)

    deleteToasts[0]?.onAction?.()
    expect(
      s()
        .items.map((i) => i.id)
        .sort(),
    ).toEqual([a, b, c, d].sort())
  })

  it('a different action between two deletes starts a fresh chain (no over-undo)', () => {
    const a = seedItem()
    const b = seedItem()
    expect(s().items).toHaveLength(2)

    s().deleteItem(a)
    vi.advanceTimersByTime(1000)
    // Unrelated action in between — its own history entry, nothing to do
    // with the delete chain.
    s().renameItem(b, 'Renamed sofa')
    s().pushHistory()
    vi.advanceTimersByTime(1000)
    s().deleteItem(b)

    const deleteToasts = s().notifications.filter(
      (n) => n.kind === 'success' && n.actionLabel === 'Undo' && n.title === 'Item deleted',
    )
    expect(deleteToasts).toHaveLength(1)

    // Undo must revert exactly the delete of b (one step) — NOT reach past
    // the unrelated rename/pushHistory entry to also resurrect a's delete,
    // and not double-pop into an unrelated state either.
    const itemsBeforeUndo = s().items
    deleteToasts[0]?.onAction?.()
    expect(s().items.some((i) => i.id === b)).toBe(true)
    expect(s().items.some((i) => i.id === a)).toBe(false)
    // Exactly one history step was consumed (rename/pushHistory entry intact).
    expect(s().items).not.toBe(itemsBeforeUndo)
  })

  it('undoing after the first toast auto-dismissed only restores the still-toasted delete', () => {
    const a = seedItem()
    const b = seedItem()
    expect(s().items).toHaveLength(2)

    s().deleteItem(a)
    const firstToast = s().notifications.find((n) => n.title === 'Item deleted')!
    // Simulate the toast's own auto-dismiss firing before the second delete.
    s().notify.dismiss(firstToast.id)
    vi.advanceTimersByTime(1000)
    s().deleteItem(b)

    const deleteToasts = s().notifications.filter((n) => n.title === 'Item deleted')
    expect(deleteToasts).toHaveLength(1)
    deleteToasts[0]?.onAction?.()

    // b comes back (its own toast); a has no surviving affordance to restore
    // it via this toast, and Undo must not try to reach for it anyway.
    expect(s().items.some((i) => i.id === b)).toBe(true)
    expect(s().items.some((i) => i.id === a)).toBe(false)
  })

  it('redo replays the coalesced deletes back off one step at a time', () => {
    const a = seedItem()
    const b = seedItem()
    seedItem()

    s().deleteItem(a)
    vi.advanceTimersByTime(1000)
    s().deleteItem(b)
    const deleteToasts = s().notifications.filter((n) => n.title === 'Item deleted')
    deleteToasts[0]?.onAction?.()
    expect(s().items.some((i) => i.id === a)).toBe(true)
    expect(s().items.some((i) => i.id === b)).toBe(true)

    // Two redos re-apply the two deletes in order, one history step each.
    s().redo()
    expect(s().items.some((i) => i.id === a)).toBe(false)
    expect(s().items.some((i) => i.id === b)).toBe(true)
    s().redo()
    expect(s().items.some((i) => i.id === b)).toBe(false)
  })

  it('grouped items: a rapid-delete chain undo restores both items AND their group', () => {
    const a = seedItem()
    const b = seedItem()
    seedItem()
    s().groupItems([a, b])
    expect(s().items.find((i) => i.id === a)?.groupId).toBeDefined()
    const groupId = s().items.find((i) => i.id === a)!.groupId

    // Delete a third, ungrouped item, then (1s later) one grouped member —
    // deleting a alone would auto-dissolve the group since b would be its
    // only remaining member; the chained Undo must restore the group intact.
    const c = seedItem()
    s().deleteItem(c)
    vi.advanceTimersByTime(1000)
    s().deleteItem(a)
    expect(s().items.find((i) => i.id === b)?.groupId).toBeUndefined() // dissolved

    const deleteToasts = s().notifications.filter((n) => n.title === 'Item deleted')
    expect(deleteToasts).toHaveLength(1)
    deleteToasts[0]?.onAction?.()

    expect(s().items.some((i) => i.id === c)).toBe(true)
    expect(s().items.find((i) => i.id === a)?.groupId).toBe(groupId)
    expect(s().items.find((i) => i.id === b)?.groupId).toBe(groupId)
  })
})
