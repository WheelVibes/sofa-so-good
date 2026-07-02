import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_dismissed_callouts'

/**
 * Tracks the ids of progressive-disclosure info callouts (P25) the user has
 * dismissed ("Don't show this again"), persisted to localStorage so a hint
 * banner never re-appears once closed. Like `recentSlice`/`favouritesSlice`,
 * this is a per-device convenience — deliberately out of the save schema +
 * autosave (it's not part of a saved design). Self-persists on every dismiss.
 */
export interface CalloutsSlice {
  dismissedCallouts: string[]
  /** Mark a callout id dismissed (deduped) → persist → set. */
  dismissCallout: (id: string) => void
}

function loadDismissed(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistDismissed(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {
    // private mode / quota — dismissals are non-critical, ignore.
  }
}

export const CALLOUTS_INITIAL: Pick<CalloutsSlice, 'dismissedCallouts'> = {
  dismissedCallouts: loadDismissed(),
}

export const createCalloutsSlice: SliceCreator<CalloutsSlice, RootState> = (set, get) => ({
  ...CALLOUTS_INITIAL,
  dismissCallout: (id) => {
    if (!id || get().dismissedCallouts.includes(id)) return
    const next = [...get().dismissedCallouts, id]
    persistDismissed(next)
    set({ dismissedCallouts: next })
  },
})
