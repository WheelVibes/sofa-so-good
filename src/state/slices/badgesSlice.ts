import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_seen_badges'

/**
 * Tracks which "New" feature badges (P27, `src/ui/newBadges.ts`) the user has
 * dismissed by using the badged entry, persisted to localStorage so a badge
 * never re-appears once seen. Like `recentSlice`/`calloutsSlice`, this is a
 * per-device convenience — deliberately out of the save schema + autosave
 * (it's not part of a saved design). Self-persists on every dismiss.
 */
export interface BadgesSlice {
  seenBadges: string[]
  /** Mark a feature flag's badge seen (deduped) → persist → set. */
  markBadgeSeen: (flagId: string) => void
}

function loadSeen(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistSeen(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {
    // private mode / quota — dismissals are non-critical, ignore.
  }
}

export const BADGES_INITIAL: Pick<BadgesSlice, 'seenBadges'> = {
  seenBadges: loadSeen(),
}

export const createBadgesSlice: SliceCreator<BadgesSlice, RootState> = (set, get) => ({
  ...BADGES_INITIAL,
  markBadgeSeen: (flagId) => {
    if (!flagId || get().seenBadges.includes(flagId)) return
    const next = [...get().seenBadges, flagId]
    persistSeen(next)
    set({ seenBadges: next })
  },
})
