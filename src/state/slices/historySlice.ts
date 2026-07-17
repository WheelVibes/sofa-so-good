import type { PriceRules } from '../../analysis/renovationCost'
import type { QuoteTemplate } from '../../export/quoteTemplate'
import type { FloorPlan } from '../../floorplan/types'
import type { FurnitureItem } from '../../furniture/types'
import type { RootState } from '../store'
import type { DesignComment } from './commentsSlice'
import type { DoorState } from './doorsSlice'
import type { DrawingCallout } from './drawingCalloutsSlice'
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
  /** The as-loaded baseline `floorPlan` is diffed against (BUG-3). `baselinePlan`
   *  only ever changes in lockstep with `floorPlan` on a load-type action
   *  (`loadSavedPlan`/`resetFloorPlan`/`newFloorPlan`/`setFloorPlan`) — a plain
   *  wall edit touches `floorPlan` but not `baselinePlan`. Snapshotting it here
   *  (rather than recomputing it on undo/redo) keeps that invariant across
   *  history navigation for free: an edit's pre-edit snapshot carries the SAME
   *  `baselinePlan` reference as the live state, so undoing/redoing an edit is a
   *  no-op for it, while undoing/redoing a load restores the pre-load baseline
   *  right along with the pre-load `floorPlan` — exactly reversing what the load
   *  action changed. Omitting it (the bug) let `floorPlan` and `baselinePlan` go
   *  out of sync across a load's undo, so the hacking/demolition plan and
   *  renovation-cost report (`diffWalls`) compared the wrong two plans.
   */
  baselinePlan: FloorPlan
  /** Pinned design comments (F24) — add/edit/resolve/delete are undoable. */
  comments: DesignComment[]
  /** Drawing-set sheet callouts — add/edit/delete are undoable. */
  drawingCallouts: DrawingCallout[]
  /** Quote template settings — branding/tax/section changes are undoable. */
  quoteTemplate: QuoteTemplate
  /** Price-rule library — finish + carpentry rate changes are undoable. */
  priceRules: PriceRules
  /** Apartment master colour palette — explicitly documented as undoable design
   *  data (`colorPaletteSlice.ts`); `applyHomeStyle` changes it in the SAME
   *  `pushHistory()` call as `finishes`/`floorPlan` on the promise that "a
   *  single undo reverts the whole style" — the same omitted-field shape as
   *  BUG-3, so it's captured here too. */
  masterPalette: string[]
  /** Per-room palette overrides — same undoable-design-data contract as
   *  `masterPalette`, see above. */
  roomPalettes: Record<string, string[]>
}

export interface HistorySlice {
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  /** Coalesce metadata. Not part of snapshots — would otherwise leak
   *  ephemeral push timing into restored states. */
  _lastPushKey: string | null
  _lastPushAt: number
  /** While true, `pushHistory`/`pushHistoryCoalesced` are no-ops. Set only by
   *  `runWithoutHistory` — lets a batch that composes many individually-pushing
   *  store actions (e.g. AI-draft plan build = newFloorPlan + N addWall/addRoom/
   *  addOpening) collapse into a single undo step: the caller pushes once, then
   *  runs the build inside `runWithoutHistory`. Not snapshotted (ephemeral). */
  _suppressHistory: boolean
  /** Run `fn` with history pushes suppressed, restoring the prior suppression
   *  state afterward (even if `fn` throws), so nested calls compose. */
  runWithoutHistory: (fn: () => void) => void
  /** Capture current undoable state and clear redo stack. Always pushes
   *  (unless suppressed via `runWithoutHistory`). */
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
  /** Keep an in-progress coalesce window alive WITHOUT pushing a new snapshot:
   *  bump `_lastPushAt` only while `key` already owns the window. Used by streams
   *  whose per-frame mutations don't themselves touch the coalesce clock (e.g. a
   *  press-and-hold nudge calls `moveItem`, not `pushHistoryCoalesced`), so a long
   *  hold followed by a quick re-tap stays one undo step. No-op for a different
   *  key, so it can never extend or hijack another action's window. */
  refreshCoalesce: (key: string) => void
  /** Pop the newest `past` entry IFF it is identical (by reference, across every
   *  snapshotted field) to the current state — i.e. a gesture pushed a snapshot
   *  then changed nothing. Used to undo the eager `pushHistory` in `startDrag`
   *  when a "drag" was actually a no-op click, so the user's first undo isn't a
   *  dead step (BUG-016). A no-op when the last entry differs (a real edit) or
   *  when there's no history. */
  dropRedundantHistory: () => void
  clearHistory: () => void
}

function snapshot(s: RootState): HistorySnapshot {
  return {
    items: s.items,
    doors: s.doors,
    finishes: s.finishes,
    floorPlan: s.floorPlan,
    baselinePlan: s.baselinePlan,
    comments: s.comments,
    drawingCallouts: s.drawingCallouts,
    quoteTemplate: s.quoteTemplate,
    priceRules: s.priceRules,
    masterPalette: s.masterPalette,
    roomPalettes: s.roomPalettes,
  }
}

/** True when a snapshot's every field is reference-identical to the live state —
 *  so restoring it would change nothing. Reference equality is sound because each
 *  mutating slice replaces (never mutates in place) the array/object it owns. */
function snapshotMatchesState(snap: HistorySnapshot, s: RootState): boolean {
  return (
    snap.items === s.items &&
    snap.doors === s.doors &&
    snap.finishes === s.finishes &&
    snap.floorPlan === s.floorPlan &&
    snap.baselinePlan === s.baselinePlan &&
    snap.comments === s.comments &&
    snap.drawingCallouts === s.drawingCallouts &&
    snap.quoteTemplate === s.quoteTemplate &&
    snap.priceRules === s.priceRules &&
    snap.masterPalette === s.masterPalette &&
    snap.roomPalettes === s.roomPalettes
  )
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
  'past' | 'future' | '_lastPushKey' | '_lastPushAt' | '_suppressHistory'
> = {
  past: [],
  future: [],
  _lastPushKey: null,
  _lastPushAt: 0,
  _suppressHistory: false,
}

export const createHistorySlice: SliceCreator<HistorySlice, RootState> = (set, get) => ({
  ...HISTORY_INITIAL,
  runWithoutHistory: (fn) => {
    const prev = get()._suppressHistory
    set({ _suppressHistory: true })
    try {
      fn()
    } finally {
      set({ _suppressHistory: prev })
    }
  },
  pushHistory: () => {
    if (get()._suppressHistory) return
    set((s) => ({
      past: appendCapped(s.past, snapshot(s)),
      future: [],
      _lastPushKey: null,
      _lastPushAt: Date.now(),
    }))
  },
  pushHistoryCoalesced: (key) => {
    const s = get()
    if (s._suppressHistory) return
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
  refreshCoalesce: (key) => {
    const s = get()
    if (s._lastPushKey === key) set({ _lastPushAt: Date.now() })
  },
  dropRedundantHistory: () =>
    set((s) => {
      if (s.past.length === 0) return s
      if (!snapshotMatchesState(s.past[s.past.length - 1], s)) return s
      return { past: s.past.slice(0, -1) }
    }),
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
        // A pending "Apply change?" confirmation is transient view state, excluded
        // from snapshots; clear it so undo/redo/jump don't strand its bar with data
        // for an edit that no longer exists (INSPECTOR-EDIT-BAR).
        pendingEdit: null,
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
        pendingEdit: null,
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
        pendingEdit: null,
      }
    }),
  clearHistory: () => set({ past: [], future: [], _lastPushKey: null, _lastPushAt: 0 }),
})
