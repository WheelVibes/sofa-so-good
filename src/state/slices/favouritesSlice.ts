import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_favourites'

/**
 * Tracks the catalog item ids the user has starred/favourited, persisted to
 * localStorage so the "Favourites" catalog tab survives reloads. Kept out of
 * the save schema + autosave — it's a per-device convenience, not part of a
 * saved design. Mirrors the `recentSlice` persistence pattern.
 *
 * Ids are stored insertion-order (oldest first internally; the star toggle
 * appends). Both local def ids and remote `provider:slug` ids are stored here.
 */
export interface FavouritesSlice {
  /** Ordered list of favourited catalog item ids (insertion order). */
  favouriteDefIds: string[]
  /** Add or remove a def id from favourites (deduped). */
  toggleFavourite: (defId: string) => void
  /** Whether a def id is currently favourited. */
  isFavourite: (defId: string) => boolean
  clearFavourites: () => void
}

function loadFavourites(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistFavourites(ids: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids))
  } catch {
    // private mode / quota — favourites are non-critical, ignore.
  }
}

export const FAVOURITES_INITIAL: Pick<FavouritesSlice, 'favouriteDefIds'> = {
  favouriteDefIds: loadFavourites(),
}

export const createFavouritesSlice: SliceCreator<FavouritesSlice, RootState> = (set, get) => ({
  ...FAVOURITES_INITIAL,
  toggleFavourite: (defId) => {
    if (!defId) return
    const current = get().favouriteDefIds
    const next = current.includes(defId)
      ? current.filter((id) => id !== defId)
      : [...current, defId]
    persistFavourites(next)
    set({ favouriteDefIds: next })
  },
  isFavourite: (defId) => get().favouriteDefIds.includes(defId),
  clearFavourites: () => {
    persistFavourites([])
    set({ favouriteDefIds: [] })
  },
})
