import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diffWalls } from '../../floorplan/demolitionPlan'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../store'
import { HISTORY_LIMIT, HISTORY_TRIM_HEADROOM } from './historySlice'

function s() {
  return useStore.getState()
}

describe('history slice', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('undo restores the previous items array after an addItem', () => {
    const before = s().items
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    expect(s().items.length).toBe(before.length + 1)
    s().undo()
    expect(s().items).toBe(before)
  })

  it('undo prunes a now-dangling selection (B7)', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().setSelectedItemIds([id])
    expect(s().selectedItemIds).toContain(id)
    s().undo() // back to before the item existed
    expect(s().items.some((i) => i.id === id)).toBe(false)
    expect(s().selectedItemIds).not.toContain(id)
    expect(s().selectedItemId).toBeNull()
  })

  it('redo replays an undone addItem', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    const afterAdd = s().items
    s().undo()
    s().redo()
    expect(s().items).toEqual(afterAdd)
  })

  it('a fresh push clears the redo stack', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().undo()
    expect(s().future.length).toBe(1)
    s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    expect(s().future.length).toBe(0)
  })

  it('coalesces rapid same-key prop edits into a single undo step', () => {
    const id = s().addItem({
      defId: 'bed-double',
      position: [0, 0],
      rotation: 0,
      props: {},
    })
    const baseDepth = s().past.length
    s().updateItemProps(id, { scale: 1.1 })
    s().updateItemProps(id, { scale: 1.2 })
    s().updateItemProps(id, { scale: 1.3 })
    // Three rapid same-prop edits → exactly one new history entry.
    expect(s().past.length).toBe(baseDepth + 1)
  })

  // PC-NUDGE-UNDO: a burst of same-key coalesced pushes (e.g. repeated arrow-key
  // nudge taps) must collapse into ONE undo step, a deliberate pause must start a
  // new one, distinct keys must never merge, and `refreshCoalesce` must keep a
  // live window open without snapshotting.
  describe('coalesce window (nudge bursts)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('a burst of same-key pushes within the window is one undo step', () => {
      s().clearHistory()
      const base = s().items
      useStore.setState({ items: [...base, base[0]!] }) // any mutation
      s().pushHistoryCoalesced('nudge')
      // Simulate 5 rapid taps, each well inside the 500ms window.
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(50)
        s().pushHistoryCoalesced('nudge')
      }
      expect(s().past.length).toBe(1)
    })

    it('a single tap is one undo step', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      expect(s().past.length).toBe(1)
    })

    it('a deliberate pause past the window starts a new undo step', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      vi.advanceTimersByTime(600) // > COALESCE_MS
      s().pushHistoryCoalesced('nudge')
      expect(s().past.length).toBe(2)
    })

    it('distinct action keys never coalesce into one step', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      vi.advanceTimersByTime(10)
      s().pushHistoryCoalesced('elev:x') // different action, same instant
      expect(s().past.length).toBe(2)
    })

    it('an interleaved plain push breaks the coalesce chain', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      s().pushHistory() // e.g. a rotate / array commit — resets _lastPushKey
      vi.advanceTimersByTime(10)
      s().pushHistoryCoalesced('nudge') // can't merge into the pre-push entry
      expect(s().past.length).toBe(3)
    })

    it('refreshCoalesce keeps the window alive without adding a snapshot', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      expect(s().past.length).toBe(1)
      // A long hold: time passes but refreshCoalesce keeps bumping the clock.
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(100)
        s().refreshCoalesce('nudge')
      }
      expect(s().past.length).toBe(1) // no new snapshot from refresh
      // A quick re-tap after the long hold still coalesces (window kept alive).
      vi.advanceTimersByTime(100)
      s().pushHistoryCoalesced('nudge')
      expect(s().past.length).toBe(1)
    })

    it('refreshCoalesce is a no-op for a different key (no hijack)', () => {
      s().clearHistory()
      s().pushHistoryCoalesced('nudge')
      const at = s()._lastPushAt
      vi.advanceTimersByTime(100)
      s().refreshCoalesce('elev:x') // different key
      expect(s()._lastPushAt).toBe(at) // unchanged
    })

    it('one undo after a coalesced burst reverts the whole burst', () => {
      s().clearHistory()
      const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const baseDepth = s().past.length
      const start = s().items.find((i) => i.id === id)!.position
      // Burst of nudges sharing one coalesced entry, each a real move.
      s().pushHistoryCoalesced('nudge')
      s().moveItem(id, [0.1, 0])
      vi.advanceTimersByTime(40)
      s().pushHistoryCoalesced('nudge')
      s().moveItem(id, [0.2, 0])
      vi.advanceTimersByTime(40)
      s().pushHistoryCoalesced('nudge')
      s().moveItem(id, [0.3, 0])
      expect(s().past.length).toBe(baseDepth + 1) // burst = one entry
      s().undo()
      expect(s().items.find((i) => i.id === id)!.position).toEqual(start)
    })
  })

  it('undo is a no-op on an empty past stack', () => {
    s().clearHistory()
    const snap = s().items
    s().undo()
    expect(s().items).toBe(snap)
  })

  // BUG-3: `baselinePlan` (the as-loaded plan the hacking/demolition plan and
  // reno-cost report diff against) must travel with `floorPlan` across history
  // navigation — a load-type action (loadSavedPlan/newFloorPlan/resetFloorPlan)
  // changes both together, so undoing/redoing it must revert/replay both
  // together too. Before the fix, `HistorySnapshot` omitted `baselinePlan`, so
  // undoing a plan load reverted `floorPlan` but left `baselinePlan` stuck on
  // the just-undone plan — `diffWalls` then compared two unrelated plans and
  // reported phantom demolished/added walls.
  describe('baselinePlan stays in lockstep with floorPlan across history nav (BUG-3)', () => {
    it('undo after loading a new plan reverts baselinePlan along with floorPlan', () => {
      s().clearHistory()
      const planA = s().floorPlan
      // Right after a load, baseline == the active plan.
      expect(s().baselinePlan).toEqual(planA)

      s().newFloorPlan('Plan B')
      const planB = s().floorPlan
      expect(planB.walls).not.toEqual(planA.walls) // genuinely different geometry
      expect(s().baselinePlan).toEqual(planB)

      s().undo()
      // floorPlan reverts to A...
      expect(s().floorPlan).toEqual(planA)
      // ...and baselinePlan MUST follow it back to A, not stay stuck on B.
      expect(s().baselinePlan).toEqual(planA)
      expect(s().baselinePlan).toEqual(s().floorPlan)

      // The hacking/reno-cost diff must therefore report nothing touched.
      const diff = diffWalls(s().baselinePlan, s().floorPlan)
      expect(diff.demolished).toHaveLength(0)
      expect(diff.added).toHaveLength(0)
    })

    it('redo re-applies the later baselinePlan along with floorPlan', () => {
      s().clearHistory()
      const planA = s().floorPlan
      s().newFloorPlan('Plan B')
      const planB = s().floorPlan
      s().undo()
      s().redo()
      expect(s().floorPlan).toEqual(planB)
      expect(s().baselinePlan).toEqual(planB)
      expect(s().baselinePlan).not.toEqual(planA)
    })

    it('undoing a plain wall edit leaves baselinePlan untouched (no regression)', () => {
      s().clearHistory()
      const baselineBefore = s().baselinePlan
      s().addWall({ start: [0, 0], end: [3, 0], thickness: 'internal' })
      // A wall edit must never move the baseline off the loaded plan.
      expect(s().baselinePlan).toBe(baselineBefore)
      s().undo()
      expect(s().baselinePlan).toBe(baselineBefore)
    })

    it('multiple loads in a row undo back through each prior baseline correctly', () => {
      s().clearHistory()
      const planA = s().floorPlan
      s().newFloorPlan('Plan B')
      const planB = s().floorPlan
      s().newFloorPlan('Plan C')
      const planC = s().floorPlan
      expect(s().baselinePlan).toEqual(planC)
      s().undo() // back to B
      expect(s().floorPlan).toEqual(planB)
      expect(s().baselinePlan).toEqual(planB)
      s().undo() // back to A
      expect(s().floorPlan).toEqual(planA)
      expect(s().baselinePlan).toEqual(planA)
    })
  })

  it('toggleDoor is undoable', () => {
    s().toggleDoor('door-bedroom1')
    expect(s().doors['door-bedroom1']?.open).toBe(true)
    s().undo()
    expect(s().doors['door-bedroom1']?.open ?? false).toBe(false)
  })

  describe('cap (amortised trim)', () => {
    const marker = (i: number): FurnitureItem[] => [
      { id: `m${i}`, defId: 'bed-double', position: [0, 0], rotation: 0, props: {} },
    ]
    const pushN = (n: number) => {
      for (let i = 0; i < n; i++) {
        useStore.setState({ items: marker(i) })
        s().pushHistory()
      }
    }

    it('grows to LIMIT+HEADROOM, then one slice trims back to LIMIT', () => {
      s().clearHistory()
      const max = HISTORY_LIMIT + HISTORY_TRIM_HEADROOM
      pushN(max)
      // No trim yet — headroom means pushes past the cap stay single copies.
      expect(s().past.length).toBe(max)
      // The next push crosses the threshold: one amortised trim to LIMIT.
      useStore.setState({ items: marker(max) })
      s().pushHistory()
      expect(s().past.length).toBe(HISTORY_LIMIT)
      // Oldest entries dropped in order: the bottom of the stack is now the
      // snapshot from push #HEADROOM+1 (0-based index HEADROOM+1... = max-LIMIT+1).
      expect(s().past[0]?.items[0]?.id).toBe(`m${max - HISTORY_LIMIT + 1}`)
    })

    it('preserves undo semantics across a trim (drains to the oldest kept state)', () => {
      s().clearHistory()
      const total = HISTORY_LIMIT + HISTORY_TRIM_HEADROOM + 1
      pushN(total)
      expect(s().past.length).toBe(HISTORY_LIMIT)
      while (s().past.length > 0) s().undo()
      // The oldest retained snapshot is push #(total - LIMIT)'s captured state.
      expect(s().items[0]?.id).toBe(`m${total - HISTORY_LIMIT}`)
      // And the drained steps are all redoable.
      expect(s().future.length).toBe(HISTORY_LIMIT)
    })
  })

  // A pending "Apply change?" confirmation is a transient view concern excluded
  // from snapshots. History navigation must still clear it, or undoing a move
  // leaves the confirm bar stranded with stale data (INSPECTOR-EDIT-BAR).
  describe('pendingEdit is cleared by history navigation', () => {
    it('undo cancels a pending edit and reverts the transform', () => {
      s().clearHistory()
      const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const before = s().items.find((i) => i.id === id)!.position
      // Simulate a drag: eager pre-move snapshot, live move, then a pending edit.
      s().pushHistory()
      s().moveItem(id, [1, 0])
      s().setPendingEdit({
        kind: 'transform',
        ids: [id],
        originals: [{ id, position: before, rotation: 0 }],
      })
      expect(s().pendingEdit).not.toBeNull()
      s().undo()
      expect(s().pendingEdit).toBeNull()
      expect(s().items.find((i) => i.id === id)!.position).toEqual(before)
    })

    it('redo clears a pending edit', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      s().undo()
      s().setPendingEdit({ kind: 'transform', ids: [], originals: [] })
      s().redo()
      expect(s().pendingEdit).toBeNull()
    })

    it('jumpHistory clears a pending edit', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
      s().setPendingEdit({ kind: 'transform', ids: [], originals: [] })
      s().jumpHistory(0)
      expect(s().pendingEdit).toBeNull()
    })
  })

  it('clearHistory drops both stacks', () => {
    s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    s().undo()
    s().clearHistory()
    expect(s().past).toEqual([])
    expect(s().future).toEqual([])
  })

  describe('jumpHistory', () => {
    it('jumps back multiple steps in one move (equivalent to N undos)', () => {
      s().clearHistory()
      const base = s().items
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
      s().addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
      // past = [base, +1, +2]; current = +3. Jump to index 0 (oldest).
      expect(s().past.length).toBe(3)
      s().jumpHistory(0)
      expect(s().items).toEqual(base)
      expect(s().past.length).toBe(0)
      // The three later states are now redoable.
      expect(s().future.length).toBe(3)
    })

    it('jumps forward into the redo stack', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const afterOne = s().items
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
      const afterTwo = s().items
      s().jumpHistory(0) // back to the very start
      expect(s().future.length).toBe(2)
      // Flat = [start, afterOne, afterTwo]; jump to index 1 → the afterOne state.
      s().jumpHistory(1)
      expect(s().items).toEqual(afterOne)
      s().jumpHistory(2)
      expect(s().items).toEqual(afterTwo)
      expect(s().future.length).toBe(0)
    })

    it('is a no-op for the current index and out-of-range indices', () => {
      s().clearHistory()
      s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
      const current = s().items
      const curIndex = s().past.length
      s().jumpHistory(curIndex) // already current
      expect(s().items).toBe(current)
      s().jumpHistory(999)
      expect(s().items).toBe(current)
      s().jumpHistory(-1)
      expect(s().items).toBe(current)
    })
  })

  describe('dropRedundantHistory (BUG-016 — no-op click pollution)', () => {
    it('drops a snapshot that changed nothing (eager push, then no mutation)', () => {
      const before = s().past.length
      s().pushHistory() // e.g. startDrag on a plain click
      expect(s().past.length).toBe(before + 1)
      s().dropRedundantHistory() // …drag was a no-op → discard
      expect(s().past.length).toBe(before)
    })

    it('keeps the snapshot when the state actually changed after the push', () => {
      s().pushHistory()
      s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} }) // real change
      const grown = s().past.length // addItem also pushed; the drag push is buried
      s().dropRedundantHistory()
      // The newest entry (addItem's pre-state) differs from current → not dropped.
      expect(s().past.length).toBe(grown)
    })

    it('is a no-op on empty history', () => {
      s().clearHistory()
      expect(s().past.length).toBe(0)
      s().dropRedundantHistory()
      expect(s().past.length).toBe(0)
    })

    it('a no-op click followed by undo is NOT a dead step', () => {
      // Establish a real edit to undo back to.
      const id = s().addItem({ defId: 'bed-double', position: [2, 2], rotation: 0, props: {} })
      const afterAdd = s().items
      // Simulate a no-op click-drag: push + nothing changed + drop.
      s().pushHistory()
      s().dropRedundantHistory()
      // The first undo now reverts the real addItem (not a dead snapshot).
      s().undo()
      expect(s().items).not.toBe(afterAdd)
      expect(s().items.some((i) => i.id === id)).toBe(false)
    })
  })
})
