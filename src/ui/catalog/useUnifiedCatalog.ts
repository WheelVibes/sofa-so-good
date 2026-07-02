import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { SharedLibraryItem } from '../../catalog/packs/sharedLibrary'
import { useRemoteEntries } from '../../catalog/remote/hooks'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useCatalogByCategory } from '../../furniture/catalog'
import { mapCategory } from '../../furniture/ikea/translate'
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type FurnitureDef,
} from '../../furniture/types'
import { useStore } from '../../state/store'

/**
 * One card in the unified catalog grid. Either a fully-resolved local
 * {@link FurnitureDef} (built-in, generated, user/IKEA upload, installed pack,
 * or a downloaded CC0 model) or a not-yet-downloaded remote CC0 {@link RemoteEntry}.
 */
export type GridItem =
  | { kind: 'local'; def: FurnitureDef }
  | { kind: 'remote'; entry: RemoteEntry }
  | { kind: 'shared'; item: SharedLibraryItem }

/** Stable id used for favouriting + React keys. Resolution-independent for
 *  remote entries so a CC0 model keeps one identity across resolutions.
 *  A shared-library item uses its predicted imported def id (`ikea-<groupKey>`)
 *  so a favourite survives the add + dedups against the local def. */
export function gridItemId(it: GridItem): string {
  if (it.kind === 'local') return it.def.id
  if (it.kind === 'remote') return `${it.entry.provider}:${it.entry.slug}`
  return `ikea-${it.item.groupKey}`
}

const FURNITURE_CATEGORY_SET = new Set<string>(FURNITURE_CATEGORIES)

/** Stable empty array so a flag-off render keeps a referentially-stable input to
 *  the memo (avoids re-running the merge on every render when remote is gated). */
const EMPTY_REMOTE: RemoteEntry[] = []
const EMPTY_SHARED: SharedLibraryItem[] = []

export interface UnifiedCatalog {
  /** Per-category cards: local defs first, then un-downloaded CC0 entries. */
  byCategory: Record<FurnitureCategory, GridItem[]>
  /** Flattened list of every card — used by the cross-catalog search. */
  all: GridItem[]
  /** Card count per category (drives which category chips render). */
  counts: Record<FurnitureCategory, number>
  /** Favourited cards, in the order they were saved. */
  favourites: GridItem[]
  /** Recently-placed cards, newest first (local defs only). */
  recent: GridItem[]
}

/**
 * Merge the local catalog (built-ins + generated + user/IKEA uploads + installed
 * packs + already-downloaded CC0) with the browsable CC0 remote index into one
 * grid model, grouped by category. A remote entry is hidden once it has been
 * downloaded (its resolved local def represents it instead) so nothing appears
 * twice. Also resolves the favourites list from the persisted `favouriteDefIds`.
 *
 * `includeRemote` (from the `remoteFurniture` feature flag) gates the browsable
 * CC0 *model* cards: when false (e.g. Simple mode, where `remoteFurniture` is a
 * `pro`-tier flag) the grid shows only the curated local catalog and no
 * un-downloaded remote entries surface. Already-resolved remote models stay as
 * local defs regardless — gating affects the browse/add path, not placed items.
 */
export function useUnifiedCatalog(includeRemote = true, includeShared = true): UnifiedCatalog {
  const localByCategory = useCatalogByCategory()
  const remoteEntriesAll = useRemoteEntries('furniture')
  const remoteEntries = includeRemote ? remoteEntriesAll : EMPTY_REMOTE
  const sharedItemsAll = useStore(useShallow((s) => s.sharedLibrary.items))
  const sharedItems = includeShared ? sharedItemsAll : EMPTY_SHARED
  const resolvedKeys = useStore(useShallow((s) => Object.keys(s.resolvedRemoteFurniture)))
  const collections = useStore(useShallow((s) => s.favouriteDefIds))
  const recentDefIds = useStore(useShallow((s) => s.recentDefIds))

  return useMemo(() => {
    // `provider:slug` of every downloaded CC0 model — these are now local defs.
    const resolvedBases = new Set(resolvedKeys.map((k) => k.slice(0, k.lastIndexOf(':'))))

    const byCategory = Object.fromEntries(
      FURNITURE_CATEGORIES.map((c) => [
        c,
        (localByCategory[c] ?? []).map((def): GridItem => ({ kind: 'local', def })),
      ]),
    ) as Record<FurnitureCategory, GridItem[]>

    // Index of every remote entry by its resolution-independent base id, used
    // both to append un-downloaded entries below and to resolve favourites.
    const remoteByBase = new Map<string, RemoteEntry>()
    for (const e of remoteEntries) {
      const base = `${e.provider}:${e.slug}`
      if (!remoteByBase.has(base)) remoteByBase.set(base, e)
      if (resolvedBases.has(base)) continue
      if (!FURNITURE_CATEGORY_SET.has(e.category)) continue
      byCategory[e.category as FurnitureCategory].push({ kind: 'remote', entry: e })
    }

    // Shared-library (R2) cards: map category the same way the importer does,
    // and hide any group already imported (its local `ikea-<groupKey>` def
    // represents it). Deduped by predicted def id.
    const localIds = new Set<string>()
    for (const c of FURNITURE_CATEGORIES)
      for (const it of byCategory[c]) if (it.kind === 'local') localIds.add(it.def.id)

    const sharedById = new Map<string, SharedLibraryItem>()
    for (const item of sharedItems) {
      const id = `ikea-${item.groupKey}`
      if (localIds.has(id) || sharedById.has(id)) continue
      sharedById.set(id, item)
      byCategory[mapCategory(item.category).category].push({ kind: 'shared', item })
    }

    const all: GridItem[] = []
    const counts = {} as Record<FurnitureCategory, number>
    for (const c of FURNITURE_CATEGORIES) {
      counts[c] = byCategory[c].length
      all.push(...byCategory[c])
    }

    // Favourites: resolve each saved id to a local def or a remote entry,
    // preserving save order. Orphans (e.g. an uninstalled pack item) drop out.
    const localById = new Map<string, FurnitureDef>()
    for (const c of FURNITURE_CATEGORIES)
      for (const it of byCategory[c]) if (it.kind === 'local') localById.set(it.def.id, it.def)

    const favourites: GridItem[] = []
    for (const id of collections) {
      const def = localById.get(id)
      if (def) {
        favourites.push({ kind: 'local', def })
        continue
      }
      const entry = remoteByBase.get(id)
      if (entry) {
        favourites.push({ kind: 'remote', entry })
        continue
      }
      const item = sharedById.get(id)
      if (item) favourites.push({ kind: 'shared', item })
    }

    // Recents: resolve placed def ids to local cards, newest first. Ids that no
    // longer resolve (e.g. an uninstalled pack / removed upload) drop out.
    const recent: GridItem[] = []
    for (const id of recentDefIds) {
      const def = localById.get(id)
      if (def) recent.push({ kind: 'local', def })
    }

    return { byCategory, all, counts, favourites, recent }
  }, [localByCategory, remoteEntries, sharedItems, resolvedKeys, collections, recentDefIds])
}
