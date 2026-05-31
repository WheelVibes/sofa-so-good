import type { FurnitureItem } from '../../furniture/types'
import type { RootState } from '../store'
import type { DoorState } from './doorsSlice'
import type { FinishesSlice } from './finishesSlice'
import type { SliceCreator } from './types'

const HISTORY_LIMIT = 50
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
  clearHistory: () => void
}

function snapshot(s: RootState): HistorySnapshot {
  return { items: s.items, doors: s.doors, finishes: s.finishes }
}

function appendCapped(stack: HistorySnapshot[], snap: HistorySnapshot): HistorySnapshot[] {
  if (stack.length >= HISTORY_LIMIT) {
    return [...stack.slice(stack.length - HISTORY_LIMIT + 1), snap]
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
        past: [...s.past, snapshot(s)],
        future: s.future.slice(0, -1),
        _lastPushKey: null,
      }
    }),
  clearHistory: () => set({ past: [], future: [], _lastPushKey: null, _lastPushAt: 0 }),
})
