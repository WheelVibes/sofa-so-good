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
  /** Per-category cards. Order (STABLE-CATALOG-ORDER): the leading local block,
   *  then the remote CC0 block, then the shared-library block — but a card NEVER
   *  jumps blocks when it's downloaded. A resolved remote entry renders its local
   *  def AT its remote slot, and an imported shared item renders its local def AT
   *  its shared slot, so grid order stays put across a download (see the merge). */
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
 * packs + already-downloaded CC0) with the browsable CC0 remote index and the
 * shared R2 library into one grid model, grouped by category. Nothing appears
 * twice — a downloaded remote entry / imported shared item resolves to a single
 * local def. Also resolves the favourites list from the persisted `favouriteDefIds`.
 *
 * **Stable order across download (STABLE-CATALOG-ORDER).** Each category lists a
 * leading local block, then the remote CC0 block, then the shared-library block.
 * Downloading a card must NOT move it: when a remote entry's `provider:slug`
 * resolves to a local def, that def is emitted `{kind:'local'}` AT the remote
 * entry's slot (and EXCLUDED from the leading local block); likewise an imported
 * shared item (`ikea-<groupKey>` local def exists) renders its local def AT the
 * shared item's slot. This relocation only happens when the remote/shared entry
 * is actually present in the merge input — so with `includeRemote=false` /
 * `includeShared=false` (or a non-admin, flag-off session where the shared library
 * isn't loaded) the resolved/imported def simply stays in the leading local block
 * exactly as before, and no un-downloaded remote/shared card surfaces.
 *
 * `includeRemote` (from the `remoteFurniture` feature flag) gates the browsable
 * CC0 *model* cards: when false (e.g. Simple mode, where `remoteFurniture` is a
 * `pro`-tier flag) the grid shows only the curated local catalog and no
 * un-downloaded remote entries surface. Already-resolved remote models stay as
 * local defs regardless — gating affects the browse/add path, not placed items.
 */
export function useUnifiedCatalog(
  includeRemote = true,
  includeShared = true,
  includePets = true,
): UnifiedCatalog {
  const localByCategory = useCatalogByCategory()
  const remoteEntriesAll = useRemoteEntries('furniture')
  const remoteEntries = includeRemote ? remoteEntriesAll : EMPTY_REMOTE
  const sharedItemsAll = useStore(useShallow((s) => s.sharedLibrary.items))
  const sharedItems = includeShared ? sharedItemsAll : EMPTY_SHARED
  const resolvedKeys = useStore(useShallow((s) => Object.keys(s.resolvedRemoteFurniture)))
  const collections = useStore(useShallow((s) => s.favouriteDefIds))
  const recentDefIds = useStore(useShallow((s) => s.recentDefIds))

  return useMemo(() => {
    const emptyBlocks = () =>
      Object.fromEntries(FURNITURE_CATEGORIES.map((c) => [c, [] as GridItem[]])) as Record<
        FurnitureCategory,
        GridItem[]
      >

    // `provider:slug` of every downloaded CC0 model — these are now local defs.
    const resolvedBases = new Set(resolvedKeys.map((k) => k.slice(0, k.lastIndexOf(':'))))
    // Resolution-independent base → its resolved local def id (the full
    // `provider:slug:resolution` key). First-wins if several resolutions exist.
    const resolvedDefIdByBase = new Map<string, string>()
    for (const k of resolvedKeys) {
      const base = k.slice(0, k.lastIndexOf(':'))
      if (!resolvedDefIdByBase.has(base)) resolvedDefIdByBase.set(base, k)
    }

    // Local cards + an id index, computed up front so remote/shared slots can
    // pull a resolved def straight into their own position.
    const localCards = Object.fromEntries(
      FURNITURE_CATEGORIES.map((c) => [
        c,
        (localByCategory[c] ?? []).map((def): GridItem => ({ kind: 'local', def })),
      ]),
    ) as Record<FurnitureCategory, GridItem[]>
    const localById = new Map<string, FurnitureDef>()
    for (const c of FURNITURE_CATEGORIES)
      for (const it of localCards[c]) if (it.kind === 'local') localById.set(it.def.id, it.def)

    // Local def ids that must LEAVE the leading local block because they render
    // at a remote/shared slot instead (STABLE-CATALOG-ORDER — a downloaded card
    // keeps its position rather than jumping to the top of its category).
    const relocated = new Set<string>()

    // Remote CC0 block. A resolved entry emits its local def AT this slot (and
    // marks that def relocated); an un-downloaded entry emits a `remote` card.
    // `remoteByBase` indexes every entry (resolved or not) for favourite lookup.
    const remoteByBase = new Map<string, RemoteEntry>()
    const remoteBlocks = emptyBlocks()
    for (const e of remoteEntries) {
      const base = `${e.provider}:${e.slug}`
      if (!remoteByBase.has(base)) remoteByBase.set(base, e)
      if (!FURNITURE_CATEGORY_SET.has(e.category)) continue
      const cat = e.category as FurnitureCategory
      if (resolvedBases.has(base)) {
        const defId = resolvedDefIdByBase.get(base)
        const def = defId ? localById.get(defId) : undefined
        if (def && !relocated.has(def.id)) {
          relocated.add(def.id)
          remoteBlocks[cat].push({ kind: 'local', def })
        }
        continue
      }
      remoteBlocks[cat].push({ kind: 'remote', entry: e })
    }

    // Shared-library (R2) block: map category the same way the importer does. An
    // imported group (its local `ikea-<groupKey>` def exists) emits that local
    // def AT this slot (relocated out of the leading block); otherwise a `shared`
    // card. `sharedById` keeps only the un-imported items (for favourite lookup).
    const sharedById = new Map<string, SharedLibraryItem>()
    const sharedBlocks = emptyBlocks()
    for (const item of sharedItems) {
      const id = `ikea-${item.groupKey}`
      if (sharedById.has(id) || relocated.has(id)) continue
      const cat = mapCategory(item.category).category
      const def = localById.get(id)
      if (def) {
        relocated.add(id)
        sharedBlocks[cat].push({ kind: 'local', def })
        continue
      }
      sharedById.set(id, item)
      sharedBlocks[cat].push({ kind: 'shared', item })
    }

    // Assemble each category: leading local block (minus relocated defs), then
    // the remote block, then the shared block.
    const byCategory = emptyBlocks()
    for (const c of FURNITURE_CATEGORIES) {
      for (const it of localCards[c])
        if (it.kind !== 'local' || !relocated.has(it.def.id)) byCategory[c].push(it)
      byCategory[c].push(...remoteBlocks[c], ...sharedBlocks[c])
    }

    // Flag-gate the `pets` category (petFittings): with the flag off the pets
    // tab is hidden (count 0) and its cards never surface in the grid or the
    // cross-catalog search / favourites / recents.
    if (!includePets) byCategory.pets = []

    const all: GridItem[] = []
    const counts = {} as Record<FurnitureCategory, number>
    for (const c of FURNITURE_CATEGORIES) {
      counts[c] = byCategory[c].length
      all.push(...byCategory[c])
    }

    // Favourites: resolve each saved id to a local def or a remote entry,
    // preserving save order. Orphans (e.g. an uninstalled pack item) drop out.
    const favourites: GridItem[] = []
    for (const id of collections) {
      const def = localById.get(id)
      if (def) {
        if (!includePets && def.category === 'pets') continue
        favourites.push({ kind: 'local', def })
        continue
      }
      const entry = remoteByBase.get(id)
      if (entry) {
        // Mirror the local branch: a pets favourite must not surface when the
        // pets tab is off (petFittings), on the remote branch too.
        if (!includePets && entry.category === 'pets') continue
        favourites.push({ kind: 'remote', entry })
        continue
      }
      const item = sharedById.get(id)
      if (item) {
        if (!includePets && mapCategory(item.category).category === 'pets') continue
        favourites.push({ kind: 'shared', item })
      }
    }

    // Recents: resolve placed def ids to local cards, newest first. Ids that no
    // longer resolve (e.g. an uninstalled pack / removed upload) drop out.
    const recent: GridItem[] = []
    for (const id of recentDefIds) {
      const def = localById.get(id)
      if (def && (includePets || def.category !== 'pets')) recent.push({ kind: 'local', def })
    }

    return { byCategory, all, counts, favourites, recent }
  }, [
    localByCategory,
    remoteEntries,
    sharedItems,
    resolvedKeys,
    collections,
    recentDefIds,
    includePets,
  ])
}
