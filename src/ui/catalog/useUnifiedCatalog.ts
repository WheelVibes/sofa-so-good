import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRemoteEntries } from '../../catalog/remote/hooks'
import type { RemoteEntry } from '../../catalog/remote/types'
import { useCatalogByCategory } from '../../furniture/catalog'
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
export type GridItem = { kind: 'local'; def: FurnitureDef } | { kind: 'remote'; entry: RemoteEntry }

/** Stable id used for favouriting + React keys. Resolution-independent for
 *  remote entries so a CC0 model keeps one identity across resolutions. */
export function gridItemId(it: GridItem): string {
  return it.kind === 'local' ? it.def.id : `${it.entry.provider}:${it.entry.slug}`
}

const FURNITURE_CATEGORY_SET = new Set<string>(FURNITURE_CATEGORIES)

export interface UnifiedCatalog {
  /** Per-category cards: local defs first, then un-downloaded CC0 entries. */
  byCategory: Record<FurnitureCategory, GridItem[]>
  /** Flattened list of every card — used by the cross-catalog search. */
  all: GridItem[]
  /** Card count per category (drives which category chips render). */
  counts: Record<FurnitureCategory, number>
  /** Favourited cards, in the order they were saved. */
  favourites: GridItem[]
}

/**
 * Merge the local catalog (built-ins + generated + user/IKEA uploads + installed
 * packs + already-downloaded CC0) with the browsable CC0 remote index into one
 * grid model, grouped by category. A remote entry is hidden once it has been
 * downloaded (its resolved local def represents it instead) so nothing appears
 * twice. Also resolves the favourites list from the persisted `collections`.
 */
export function useUnifiedCatalog(): UnifiedCatalog {
  const localByCategory = useCatalogByCategory()
  const remoteEntries = useRemoteEntries('furniture')
  const resolvedKeys = useStore(useShallow((s) => Object.keys(s.resolvedRemoteFurniture)))
  const collections = useStore(useShallow((s) => s.collections))

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
      if (entry) favourites.push({ kind: 'remote', entry })
    }

    return { byCategory, all, counts, favourites }
  }, [localByCategory, remoteEntries, resolvedKeys, collections])
}
