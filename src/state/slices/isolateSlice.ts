import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Isolate / solo the selection (FEAT-C) — a one-tap focus mode for a dense
 * furnished HDB, mirroring Blender's local-view / SketchUp's isolate: while
 * active, every placed item OUTSIDE the current selection renders dimmed (low
 * opacity, not hidden) so the room's context stays legible while the piece
 * being worked on stands out.
 *
 * Session-only (like `selectionSlice.hiddenItemIds`) — `isolateActive` is a
 * pure boolean flag, never persisted/serialized/autosaved. It does NOT store
 * which ids were isolated: "which items are dimmed" is re-derived on every
 * render from the LIVE selection via `furniture/isolateSelection.ts`'s
 * `computeDimmedItemIds`, so isolate always tracks the current selection
 * rather than a stale snapshot from when it was turned on.
 *
 * Auto-clear (so a stale solo view never outlives the item it was framing) is
 * wired in `store.ts` as a subscription on `selectedItemIds`, not here — that
 * one subscription covers BOTH triggers the spec calls for: a plain selection
 * change, and exiting the room editor (`uiSlice.exitRoomEditor` already
 * clears selection via `selectItem(null)` / a direct `selectedItemIds: []`
 * patch on room entry, so watching selection is a strict superset of
 * watching room-editor state — no separate hook needed there).
 */
export interface IsolateSlice {
  isolateActive: boolean
  /** Turn isolate on/off directly (used by the auto-clear watcher + tests). */
  setIsolateActive: (active: boolean) => void
  /** Toggle isolate for the current selection. No-op turning on with nothing
   *  selected — isolating would just dim the whole room to no purpose. */
  toggleIsolateSelection: () => void
}

export const ISOLATE_INITIAL: Pick<IsolateSlice, 'isolateActive'> = {
  isolateActive: false,
}

export const createIsolateSlice: SliceCreator<IsolateSlice, RootState> = (set) => ({
  ...ISOLATE_INITIAL,
  setIsolateActive: (active) =>
    set((s) => (s.isolateActive === active ? {} : { isolateActive: active })),
  toggleIsolateSelection: () =>
    set((s) => {
      if (s.isolateActive) return { isolateActive: false }
      if (s.selectedItemIds.length === 0) return {}
      return { isolateActive: true }
    }),
})
