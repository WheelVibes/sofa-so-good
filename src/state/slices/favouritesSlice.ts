import { hasBackend } from '../../features/api/client'
import {
  fetchCloudFavourites,
  pushFavourite,
  removeCloudFavourite,
} from '../../features/favouritesSync'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

const LS_KEY = 'hdb_favourites'
const LS_KEY_FINISH = 'hdb_fav_finishes'

/** Cloud favourites sync is active only with a backend + signed-in + accounts on. */
function cloudActive(currentUser: unknown): boolean {
  return hasBackend() && !!currentUser && isFeatureEnabled('accounts')
}

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
  /** Pull cloud favourites and merge (union) with local, then push local-only up.
   *  Called on sign-in when a backend is configured. No-op for guests. */
  syncFavouritesFromCloud: () => Promise<void>
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
    const adding = !current.includes(defId)
    const next = adding ? [...current, defId] : current.filter((id) => id !== defId)
    persistFavourites(LS_KEY, next)
    set({ favouriteDefIds: next })
    if (cloudActive(get().currentUser)) {
      void (adding ? pushFavourite('furniture', defId) : removeCloudFavourite('furniture', defId))
    }
  },
  isFavourite: (defId) => get().favouriteDefIds.includes(defId),
  clearFavourites: () => {
    persistFavourites(LS_KEY, [])
    set({ favouriteDefIds: [] })
  },
  toggleFinishFavourite: (finishId) => {
    if (!finishId) return
    const current = get().favouriteFinishIds
    const adding = !current.includes(finishId)
    const next = adding ? [...current, finishId] : current.filter((id) => id !== finishId)
    persistFavourites(LS_KEY_FINISH, next)
    set({ favouriteFinishIds: next })
    if (cloudActive(get().currentUser)) {
      void (adding ? pushFavourite('finish', finishId) : removeCloudFavourite('finish', finishId))
    }
  },
  isFinishFavourite: (finishId) => get().favouriteFinishIds.includes(finishId),
  syncFavouritesFromCloud: async () => {
    if (!cloudActive(get().currentUser)) return
    const cloud = await fetchCloudFavourites()
    if (!cloud) return
    const union = (local: string[], remote: string[]) => [...new Set([...remote, ...local])]
    const localFurn = get().favouriteDefIds
    const localFin = get().favouriteFinishIds
    const furniture = union(localFurn, cloud.furniture)
    const finish = union(localFin, cloud.finish)
    persistFavourites(LS_KEY, furniture)
    persistFavourites(LS_KEY_FINISH, finish)
    set({ favouriteDefIds: furniture, favouriteFinishIds: finish })
    // Push any local-only ids up so the two sides converge.
    for (const id of localFurn)
      if (!cloud.furniture.includes(id)) void pushFavourite('furniture', id)
    for (const id of localFin) if (!cloud.finish.includes(id)) void pushFavourite('finish', id)
  },
})
