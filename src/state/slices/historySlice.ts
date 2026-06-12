import type { FloorPlan } from '../../floorplan/types'
import type { FurnitureItem } from '../../furniture/types'
import type { RootState } from '../store'
import type { DesignComment } from './commentsSlice'
import type { DoorState } from './doorsSlice'
import type { FinishesSlice } from './finishesSlice'
import type { SliceCreator } from './types'

export const HISTORY_LIMIT = 50
/** Trim slack above the cap (PERF-FOLLOWUPS): the stack may grow to
 *  LIMIT+HEADROOM before one amortised re-slice back to LIMIT, instead of
 *  re-slicing the whole array on every push past the cap. Undo depth is thus
 *  always ≥ LIMIT and bounded by LIMIT+HEADROOM. */
export const HISTORY_TRIM_HEADROOM = 16
/** Max gap between same-key coalesced pushes — newer pushes within this
 *  window collapse into the existing entry instead of creating a new one. */
const COALESCE_MS = 500

/** Captured shape for undo/redo. Selection is intentionally excluded:
 *  consistent with autosave (which doesn't persist it) and with how most
 *  tools treat selection as a view concern, not an editable mutation. */
export interface HistorySnapshot {
  items: FurnitureItem[]
  doors: Record<string, DoorState>
  finishes: FinishesSlice['finishes']
  /** The apartment shell, so drawing/editing the plan is undoable too. */
  floorPlan: FloorPlan
  /** Pinned design comments (F24) — add/edit/resolve/delete are undoable. */
  comments: DesignComment[]
}

export interface HistorySlice {
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  /** Coalesce metadata. Not part of snapshots — would otherwise leak
   *  ephemeral push timing into restored states. */
  _lastPushKey: string | null
  _lastPushAt: number
  /** Capture current undoable state and clear redo stack. Always pushes. */
  pushHistory: () => void
  /** Push only when `key` differs from the last call OR the coalesce
   *  window has elapsed. Use for streams of fine-grained edits (slider
   *  drag, rapid deletes) that should collapse into a single undo step. */
  pushHistoryCoalesced: (key: string) => void
  undo: () => void
  redo: () => void
  /** Jump directly to a state in the flat undo/redo timeline (oldest → newest;
   *  `past.length` is the current state). Unifies multi-step undo/redo so the
   *  history panel can restore any past or future step in one move. No-op for an
   *  out-of-range index or the current index. */
  jumpHistory: (targetIndex: number) => void
  clearHistory: () => void
}

function snapshot(s: RootState): HistorySnapshot {
  return {
    items: s.items,
    doors: s.doors,
    finishes: s.finishes,
    floorPlan: s.floorPlan,
    comments: s.comments,
  }
}

/** Drop selection ids that no longer exist in the restored snapshot's items, so
 *  undo/redo/jump can't leave a dangling selection pointing at a deleted item. */
function prunedSelection(
  snap: HistorySnapshot,
  s: RootState,
): { selectedItemId: string | null; selectedItemIds: string[] } {
  const ids = new Set(snap.items.map((i) => i.id))
  return {
    selectedItemId: s.selectedItemId && ids.has(s.selectedItemId) ? s.selectedItemId : null,
    selectedItemIds: s.selectedItemIds.filter((id) => ids.has(id)),
  }
}

/** Append with an amortised cap: normal pushes are a single spread copy; only
 *  once the stack hits LIMIT+HEADROOM does one slice drop the oldest entries
 *  back down to LIMIT (keeping the newest), so pushing past the cap doesn't
 *  slice-and-copy the whole array twice on every single push. */
function appendCapped(stack: HistorySnapshot[], snap: HistorySnapshot): HistorySnapshot[] {
  if (stack.length >= HISTORY_LIMIT + HISTORY_TRIM_HEADROOM) {
    const next = stack.slice(stack.length - (HISTORY_LIMIT - 1))
    next.push(snap)
    return next
  }
  return [...stack, snap]
}

export const HISTORY_INITIAL: Pick<
  HistorySlice,
  'past' | 'future' | '_lastPushKey' | '_lastPushAt'
> = {
  past: [],
  future: [],
  _lastPushKey: null,
  _lastPushAt: 0,
}

export const createHistorySlice: SliceCreator<HistorySlice, RootState> = (set, get) => ({
  ...HISTORY_INITIAL,
  pushHistory: () =>
    set((s) => ({
      past: appendCapped(s.past, snapshot(s)),
      future: [],
      _lastPushKey: null,
      _lastPushAt: Date.now(),
    })),
  pushHistoryCoalesced: (key) => {
    const s = get()
    const now = Date.now()
    if (s._lastPushKey === key && now - s._lastPushAt < COALESCE_MS) {
      set({ _lastPushAt: now })
      return
    }
    set((cur) => ({
      past: appendCapped(cur.past, snapshot(cur)),
      future: [],
      _lastPushKey: key,
      _lastPushAt: now,
    }))
  },
  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      return {
        ...prev,
        ...prunedSelection(prev, s),
        past: s.past.slice(0, -1),
        future: [...s.future, snapshot(s)],
        _lastPushKey: null,
      }
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[s.future.length - 1]
      return {
        ...next,
        ...prunedSelection(next, s),
        past: [...s.past, snapshot(s)],
        future: s.future.slice(0, -1),
        _lastPushKey: null,
      }
    }),
  jumpHistory: (targetIndex) =>
    set((s) => {
      // Flat chronological timeline: past (oldest→newest), current, then the
      // redo stack reversed (it stores the nearest-future state last).
      const flat = [...s.past, snapshot(s), ...[...s.future].reverse()]
      if (targetIndex < 0 || targetIndex >= flat.length) return s
      if (targetIndex === s.past.length) return s // already current
      const next = flat[targetIndex]!
      return {
        ...next,
        ...prunedSelection(next, s),
        past: flat.slice(0, targetIndex),
        // Re-stack everything after the target as the redo stack (nearest last).
        future: [...flat.slice(targetIndex + 1)].reverse(),
        _lastPushKey: null,
      }
    }),
  clearHistory: () => set({ past: [], future: [], _lastPushKey: null, _lastPushAt: 0 }),
})
