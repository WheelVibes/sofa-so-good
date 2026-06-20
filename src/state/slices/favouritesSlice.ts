import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_favourites'
const LS_KEY_FINISH = 'hdb_fav_finishes'

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
  /** Ordered list of favourited finish/material ids (separate from furniture so
   *  the catalog "Favourites" tab never shows un-renderable finish ids). */
  favouriteFinishIds: string[]
  /** Add or remove a finish/material id from finish favourites (deduped). */
  toggleFinishFavourite: (finishId: string) => void
  /** Whether a finish/material id is currently favourited. */
  isFinishFavourite: (finishId: string) => boolean
}

function loadFavourites(key: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistFavourites(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // private mode / quota — favourites are non-critical, ignore.
  }
}

export const FAVOURITES_INITIAL: Pick<FavouritesSlice, 'favouriteDefIds' | 'favouriteFinishIds'> = {
  favouriteDefIds: loadFavourites(LS_KEY),
  favouriteFinishIds: loadFavourites(LS_KEY_FINISH),
}

export const createFavouritesSlice: SliceCreator<FavouritesSlice, RootState> = (set, get) => ({
  ...FAVOURITES_INITIAL,
  toggleFavourite: (defId) => {
    if (!defId) return
    const current = get().favouriteDefIds
    const next = current.includes(defId)
      ? current.filter((id) => id !== defId)
      : [...current, defId]
    persistFavourites(LS_KEY, next)
    set({ favouriteDefIds: next })
  },
  isFavourite: (defId) => get().favouriteDefIds.includes(defId),
  clearFavourites: () => {
    persistFavourites(LS_KEY, [])
    set({ favouriteDefIds: [] })
  },
  toggleFinishFavourite: (finishId) => {
    if (!finishId) return
    const current = get().favouriteFinishIds
    const next = current.includes(finishId)
      ? current.filter((id) => id !== finishId)
      : [...current, finishId]
    persistFavourites(LS_KEY_FINISH, next)
    set({ favouriteFinishIds: next })
  },
  isFinishFavourite: (finishId) => get().favouriteFinishIds.includes(finishId),
})
