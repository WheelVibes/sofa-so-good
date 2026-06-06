import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Max number of recently-used catalog items remembered. */
const MAX_RECENT = 24
const LS_KEY = 'hdb_recent_items'

/**
 * Tracks the catalog item ids the user most recently placed (newest first),
 * persisted to localStorage so the "Recent" catalog row survives reloads. Kept
 * out of the save schema + autosave — it's a per-device convenience, not part of
 * a saved design. Hooked from `addItem` (the only path real user placements,
 * duplicates and pastes flow through; the boot seed + set drops use `setItems`).
 */
export interface RecentSlice {
  recentDefIds: string[]
  /** Move a def id to the front of the recent list (deduped, capped). */
  pushRecent: (defId: string) => void
  clearRecent: () => void
}

function loadRecent(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistRecent(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {
    // private mode / quota — recents are non-critical, ignore.
  }
}

export const RECENT_INITIAL: Pick<RecentSlice, 'recentDefIds'> = {
  recentDefIds: loadRecent(),
}

export const createRecentSlice: SliceCreator<RecentSlice, RootState> = (set, get) => ({
  ...RECENT_INITIAL,
  pushRecent: (defId) => {
    if (!defId) return
    const next = [defId, ...get().recentDefIds.filter((id) => id !== defId)].slice(0, MAX_RECENT)
    persistRecent(next)
    set({ recentDefIds: next })
  },
  clearRecent: () => {
    persistRecent([])
    set({ recentDefIds: [] })
  },
})
