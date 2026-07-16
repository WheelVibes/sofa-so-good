import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { roomKindFromName } from '../../analysis/suggestions'
import { hasBackend } from '../../features/api/client'
import { isAdminUser } from '../../features/auth/types'
import { useFeature } from '../../features/useFeature'
import { FURNITURE_CATEGORIES } from '../../furniture/types'
import { roomDisplayName } from '../../state/rooms'
import { useStore } from '../../state/store'
import { lazyWithRetry } from '../app/lazyWithRetry'
import { Button } from '../controls/Button'
import { Select } from '../controls/Select'
import { EmptyState } from '../EmptyState'
import { SheetGrab, useSwipeToCollapse } from '../inspector/useInspectorMinimize'
import { Icon } from '../toolbar/icons'
import { useAmbientFx } from '../useAmbientFx'
import { useCollapseTransition } from '../useCollapseTransition'
import { useIsMobile } from '../useIsMobile'
import { CatalogCard } from './CatalogCard'
import { CatalogFilterButton } from './CatalogFilterButton'
import { CatalogResizeHandle } from './CatalogResizeHandle'
import { type CatalogCategory, CategoryTabs } from './CategoryTabs'
import {
  type CatalogFilter,
  DEFAULT_CATALOG_FILTER,
  filterByFits,
  filterByMaxPrice,
  filterCatalog,
  isCatalogFilterActive,
  SORT_LABEL,
  type SortKey,
  sortCards,
} from './catalogBrowse'
import { LayersPanel } from './LayersPanel'
import { RemoteCard } from './RemoteCard'
import { clearRecent, loadRecent, pushRecent } from './recentSearches'
import { confirmAndRemoveDef } from './removeImportedDef'
import { defaultCategoryForRoomKind, relevantCategoriesForRoomKind } from './roomAwareCategories'
import { SharedCard } from './SharedCard'
import { StampBanner } from './StampBanner'
import { fuzzySearchSmart, matchedIntents } from './searchSynonyms'
import { sharedGroupForDef } from './sharedGroupForDef'
import { useActiveRoomFreeRects } from './useCatalogRoomFit'

// Lazy-loaded: the packs tab (pack install pipeline + unzip + thumbnail
// renderer) and the model upload dialog (format converters + optimize pass)
// are only needed once the user opens them, so they stay out of the boot
// bundle (P-CHUNK). The upload dialog resets its state on close anyway, so
// mount-gating it on `uploadOpen` is behaviour-identical.
const PacksTab = lazyWithRetry(() => import('./PacksTab').then((m) => ({ default: m.PacksTab })))
const UploadModelDialog = lazyWithRetry(() =>
  import('../upload/UploadModelDialog').then((m) => ({ default: m.UploadModelDialog })),
)

import { type GridItem, gridItemId, useUnifiedCatalog } from './useUnifiedCatalog'

type Mode = 'catalog' | 'packs'

/** Cards per page in the catalog grid (2-col layout → 12 = 6 rows). */
const PAGE_SIZE = 12

/** Text fields a card is searched over (local def vs. remote CC0 entry). */
function gridItemText(it: GridItem): string[] {
  if (it.kind === 'local') return [it.def.name, ...(it.def.keywords ?? [])]
  if (it.kind === 'remote') return [it.entry.name, it.entry.slug, ...(it.entry.tags ?? [])]
  return [it.item.name, it.item.type, it.item.series]
}

// Remember the last browsed category + sort across reloads (per device), so a
// returning user resumes where they left off rather than always at "seating".
const PREFS_KEY = 'hdb_catalog_browse'
function loadBrowsePrefs(): { active: CatalogCategory; sortBy: SortKey } {
  const fallback = { active: 'seating' as CatalogCategory, sortBy: 'default' as SortKey }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as { active?: string; sortBy?: string }
    return {
      active: typeof p.active === 'string' ? (p.active as CatalogCategory) : fallback.active,
      sortBy:
        p.sortBy === 'name' || p.sortBy === 'size' || p.sortBy === 'price' ? p.sortBy : 'default',
    }
  } catch {
    return fallback
  }
}

/** Sliding left-side drawer. Toggles between a single unified catalog grid
 *  (built-in + uploads + installed packs + browsable CC0) and an Objects/Layers
 *  tree (`leftMode`). The Packs tab installs asset packs (whose items then show
 *  in the unified grid). Click/drag a card to place it. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen)
  const cameraMode = useStore((s) => s.cameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const roomEditorRoomId = useStore((s) => s.roomEditor.roomId)
  const floorPlan = useStore((s) => s.floorPlan)
  // PLAN-FURNISH: the catalog also surfaces inside the 2D floor-plan editor,
  // behind the pro-tier `planFurnish` flag. Phase 1 shipped desktop
  // click-to-place only; Phase 2 extends the same gate to mobile — the drawer
  // becomes the standard `body.mobile` bottom sheet (`.catalog` in
  // `responsive.css`), lifted above the plan's full-screen overlay by the
  // `.dock-panel-left.catalog-in-plan` z-index bump (that rule applies
  // regardless of viewport, so no new CSS is needed for the mobile case).
  // Arming a placement from a card auto-closes the sheet so the plan is
  // visible for the placement tap (see `CatalogCard`'s plan-editor branch).
  // This is the ONLY new gate — `canEditScene`/`roomEditorActive`'s existing
  // meaning is untouched; see `state/editing.ts` / the PLAN-FURNISH
  // implementation plan.
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const fPlanFurnish = useFeature('planFurnish')
  const isMobile = useIsMobile()
  const planFurnishActive = floorPlanEditing && fPlanFurnish
  // Mobile bottom-sheet minimize (bug #7): collapse the catalog to just its
  // header (swipe the handle down, or tap the −/+ button) so it stops covering
  // the room while a piece is being positioned, then swipe up / tap + to expand.
  // Session-local (resets when the catalog closes); desktop keeps the full dock.
  const [catalogMinimized, setCatalogMinimized] = useState(false)
  const catalogSwipe = useSwipeToCollapse(catalogMinimized, () => setCatalogMinimized((v) => !v))
  // On mobile the sheet can collapse to just its header; desktop dock never minimizes.
  const minimized = isMobile && catalogMinimized
  // Smooth collapse/expand of the body (mirrors the inspector) — the body stays
  // UNMOUNTED once fully collapsed so a minimized catalog renders no grid cards.
  const body = useCollapseTransition(minimized)
  const setOpen = useStore((s) => s.setCatalogOpen)
  const leftMode = useStore((s) => s.leftMode)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const removeUserFurniture = useStore((s) => s.removeUserFurniture)
  const confirmAction = useStore((s) => s.confirmAction)
  const addSharedGroup = useStore((s) => s.addSharedGroup)
  const sharedItems = useStore(useShallow((s) => s.sharedLibrary.items))
  const sharedResolving = useStore(useShallow((s) => s.sharedLibrary.resolving))
  const setActiveDefId = useStore((s) => s.setActiveDefId)
  const setGlbDesignerOpen = useStore((s) => s.setGlbDesignerOpen)
  const setParametricOpen = useStore((s) => s.setParametricOpen)
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  // Packs (downloadable-content installs) is advanced — hidden in Simple mode.
  // Read here (with the other hooks) so it stays above the early return below.
  const proMode = useStore((s) => s.uiMode === 'pro')
  // Feature flags: the Packs tab + model upload entry hide when their flag is off
  // (parity with the dev/prod gating already applied inside each surface).
  const fPacks = useFeature('packs')
  const fUpload = useFeature('modelUpload')
  const fParametric = useFeature('parametricFurniture')
  // The 3D asset designer "Design" button — gated by its flag (pro tier, so it
  // stays hidden in Simple mode exactly as the old `isPro` check did).
  const fGlbDesigner = useFeature('glbDesigner')
  const fFavourites = useFeature('catalogFavourites')
  // Browsable CC0 3D models (Poly Haven) are an advanced, external surface — gated
  // behind `remoteFurniture` (pro tier), so they hide in Simple mode and the grid
  // shows only the curated builtin loop. Drives both the grid merge and the index
  // bootstrap (don't fetch the model index when off).
  const fRemoteFurniture = useFeature('remoteFurniture')
  const fCatalogResize = useFeature('catalogResize')
  // Materials browse (FinishPicker) shares the same provider index, so the drawer
  // still bootstraps it when only the material browser is enabled.
  const fRemoteMaterials = useFeature('remoteMaterials')
  // Shared R2 library cards merge into the grid behind the `sharedLibrary`
  // (simple-tier) flag AND an admin session — the role, not the Simple/Pro mode,
  // is the gate; bootstrap fetches the manifest once on open.
  const fSharedLibrary = useFeature('sharedLibrary')
  const isAdmin = useStore((s) => isAdminUser(s.currentUser))
  const sharedOn = fSharedLibrary && isAdmin
  const bootstrapShared = useStore((s) => s.bootstrapSharedLibrary)
  // Price displays/filters are gated behind the budget/price feature (off by default).
  const priceOn = useFeature('budget')
  // "Fits this room" size cue (CATALOG-FITS) — free-space rects of the room
  // being edited (null when no room is active), the passive per-card badge
  // flag, and the pro-tier "Fits only" browse filter built on top of it.
  const roomFreeRects = useActiveRoomFreeRects()
  const fFits = useFeature('catalogFits')
  const fFitsFilter = useFeature('catalogFitsFilter')
  // Room-aware default landing category (CATALOG-ROOMAWARE) — see the effect
  // below that applies it on room ENTRY only.
  const fRoomAware = useFeature('catalogRoomAware')
  // Catalog filter control (availability / source / favourites) — pure
  // client-side filtering of the merged grid, gated by `catalogFilters` (simple
  // tier). State is component-local + ephemeral (never persisted).
  const fCatalogFilters = useFeature('catalogFilters')
  const fPetFittings = useFeature('petFittings')
  const [filter, setFilter] = useState<CatalogFilter>(DEFAULT_CATALOG_FILTER)
  const favouriteDefIds = useStore(useShallow((s) => s.favouriteDefIds))
  const favIds = useMemo(() => new Set(favouriteDefIds), [favouriteDefIds])
  const [fitsOnly, setFitsOnly] = useState(false)
  const ambientFx = useAmbientFx()
  const unified = useUnifiedCatalog(fRemoteFurniture, sharedOn, fPetFittings)
  // The real category to land on from a "Browse furniture" CTA (favourites/
  // recent/empty-category empty states) — the first real category that
  // actually has cards, so the CTA never lands on another empty tab. Labelled
  // "Browse furniture" rather than "Browse all" because it always lands on
  // one specific category, not an "all items" view.
  const firstBrowsableCategory =
    FURNITURE_CATEGORIES.find((c) => (unified.counts[c] ?? 0) > 0) ?? 'seating'
  const [active, setActive] = useState<CatalogCategory>(() => loadBrowsePrefs().active)
  const [mode, setMode] = useState<Mode>('catalog')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>(() => loadBrowsePrefs().sortBy)
  const [maxPrice, setMaxPrice] = useState('')
  // Recent searches: chips shown when the field is focused + empty (commit on Enter).
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const [searchFocused, setSearchFocused] = useState(false)

  // PERF-005: keep typing responsive — rank against a DEFERRED query so the
  // input updates immediately while the expensive fuzzy ranking over the whole
  // (local + CC0) catalog runs in a non-blocking render, and memoise it so it
  // only recomputes when the query/catalog/category actually change (not on
  // unrelated re-renders like hover).
  const deferredQuery = useDeferredValue(query)
  const dq = deferredQuery.trim()
  const baseCards = useMemo(
    () =>
      dq
        ? fuzzySearchSmart(dq, unified.all, gridItemText)
        : active === 'favourites' && fFavourites
          ? unified.favourites
          : active === 'recent'
            ? unified.recent
            : active === 'favourites'
              ? [] // favourites tab active but flag off: show nothing (edge-case guard)
              : sortCards(
                  unified.byCategory[active] ?? [],
                  !priceOn && sortBy === 'price' ? 'default' : sortBy,
                ),
    [dq, unified, active, fFavourites, priceOn, sortBy],
  )

  const sortOptions = useMemo(
    () =>
      (Object.keys(SORT_LABEL) as SortKey[])
        .filter((k) => priceOn || k !== 'price')
        .map((k) => ({ value: k, label: SORT_LABEL[k] })),
    [priceOn],
  )
  const categorySortable =
    !dq &&
    active !== 'favourites' &&
    active !== 'recent' &&
    (unified.byCategory[active]?.length ?? 0) > 1

  useEffect(() => {
    // Don't fetch the remote model/material index when both browse surfaces are
    // off (e.g. Simple mode forces `remoteFurniture` off; with materials also off
    // there is nothing to populate, so skip the network entirely).
    if (open && phStatus === 'idle' && (fRemoteFurniture || fRemoteMaterials))
      void bootstrapRemote()
  }, [open, phStatus, bootstrapRemote, fRemoteFurniture, fRemoteMaterials])

  // Fetch the shared R2 library manifest once when the catalog opens for a
  // signed-in admin with the flag on (the slice self-guards the actual fetch).
  useEffect(() => {
    if (open && sharedOn && hasBackend()) void bootstrapShared()
  }, [open, sharedOn, bootstrapShared])

  // Persist the browse category + sort (best-effort) so the drawer reopens where
  // the user left off.
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ active, sortBy }))
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }, [active, sortBy])

  // CATALOG-ROOMAWARE: on ENTERING a room to edit, land the catalog on the
  // category most relevant to that room's kind (bedroom→beds, kitchen→
  // appliances, ...) instead of always the same curated/persisted default.
  // Keyed on the room id (not just "a room is active") so switching rooms
  // re-applies the pick — but only on that transition: once landed, a manual
  // tab pick during the same room-editing session is never overridden (the
  // effect body is a no-op unless the room-id key itself changed). An
  // unmapped/unknown room kind (`relevantCategoriesForRoomKind` empty) or the
  // whole-flat view (no room active) intentionally leaves `active` untouched
  // — today's persisted-default behaviour, unchanged.
  const roomEntryKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!fRoomAware) return
    const key = roomEditorActive && roomEditorRoomId ? roomEditorRoomId : null
    if (key === roomEntryKeyRef.current) return
    roomEntryKeyRef.current = key
    if (!key) return
    const kind = roomKindFromName(roomDisplayName(key, floorPlan))
    if (relevantCategoriesForRoomKind(kind).length === 0) return
    setActive(defaultCategoryForRoomKind(kind, unified.counts, firstBrowsableCategory))
    setPage(0)
  }, [
    fRoomAware,
    roomEditorActive,
    roomEditorRoomId,
    floorPlan,
    unified.counts,
    firstBrowsableCategory,
  ])

  // The scrollable card grid — paging scrolls it back to the top so a Next/Prev
  // never lands mid-list (the previous page's scroll offset carried over).
  const gridRef = useRef<HTMLDivElement>(null)
  const goToPage = (updater: (p: number) => number) => {
    setPage(updater)
    if (gridRef.current) gridRef.current.scrollTop = 0
  }

  // Reset to page 1 when the visible list changes; the render also clamps.
  const selectCategory = (c: CatalogCategory) => {
    setActive(c)
    setPage(0)
  }
  const onSearch = (v: string) => {
    setQuery(v)
    setPage(0)
  }

  // Placing/customising furniture is editing, so the catalog shows inside the
  // per-room editor (orbit) — and, behind `planFurnishActive` above, inside
  // the 2D floor-plan editor too. Orbit-over-the-flat and walk otherwise stay
  // view-only with no catalog.
  if (!open || cameraMode !== 'orbit' || !(roomEditorActive || planFurnishActive)) return null
  // `q` reflects the deferred query (matches the ranked results shown below); the
  // search input itself still binds to the live `query` so typing feels instant.
  const q = dq
  // Optional max-price + "fits only" filters — browse-only (their controls
  // live in the browse sort row), so a stale cap/toggle can never silently
  // filter search results.
  const fitsOnlyActive = fFitsFilter && fitsOnly
  const priceFiltered = q ? baseCards : filterByMaxPrice(baseCards, maxPrice)
  // The grid before the availability/source/favourites filter control is applied
  // — its makeup decides whether the Availability facet is even meaningful.
  const preFilterCards = q
    ? baseCards
    : filterByFits(priceFiltered, fitsOnlyActive ? roomFreeRects : null)
  // The Availability facet only makes sense when the grid actually holds
  // un-downloaded (remote/shared) cards; otherwise force it back to 'all' so a
  // stale 'Not downloaded' pick from another category can't empty an all-local one.
  const hasDownloadable = preFilterCards.some((it) => it.kind !== 'local')
  const effectiveFilter: CatalogFilter = hasDownloadable
    ? filter
    : { ...filter, availability: 'all' }
  const catFilterActive = fCatalogFilters && isCatalogFilterActive(effectiveFilter)
  const allCards = fCatalogFilters
    ? filterCatalog(preFilterCards, effectiveFilter, favIds)
    : preFilterCards

  // Paginate so a big category/search doesn't render hundreds of cards at once.
  const pageCount = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const cards = allCards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const totalCount = unified.all.length

  // One flat tab row: the catalog grid, the Objects/Layers tree (store-level
  // `leftMode`, shared with the command palette + mobile toolbar), and Packs.
  const view: 'catalog' | 'layers' | 'packs' =
    leftMode === 'layers' ? 'layers' : mode === 'packs' && proMode && fPacks ? 'packs' : 'catalog'
  const selectView = (v: 'catalog' | 'layers' | 'packs') => {
    if (v === 'layers') {
      setLeftMode('layers')
    } else {
      setLeftMode('catalog')
      setMode(v)
    }
  }

  // Re-download an imported shared/ikea def from R2 in place (keeps placements +
  // rebuilds its GLB/thumbnail blobs via replaceUserFurniture). Only wired when the
  // def maps to a loaded manifest item (admin + `sharedLibrary` + backend), so a
  // dev-scrape/non-admin def never shows the control.
  const handleRefresh = async (slug: string, name: string) => {
    const id = await addSharedGroup(slug)
    const notify = useStore.getState().notify
    if (id) notify.start({ title: `Refreshed ${name}`, kind: 'success' })
    else notify.start({ title: `Couldn't refresh ${name} — check your connection`, kind: 'error' })
  }

  const renderCard = (it: GridItem, staggerIndex: number) => {
    if (it.kind === 'local') {
      const refreshSlug = sharedOn && hasBackend() ? sharedGroupForDef(it.def, sharedItems) : null
      return (
        <CatalogCard
          key={gridItemId(it)}
          def={it.def}
          staggerIndex={staggerIndex}
          onDelete={() =>
            void confirmAndRemoveDef(it.def, {
              placedCount: useStore.getState().items.filter((i) => i.defId === it.def.id).length,
              confirmAction,
              removeUserFurniture,
            })
          }
          onRefresh={refreshSlug ? () => void handleRefresh(refreshSlug, it.def.name) : undefined}
          refreshing={refreshSlug ? sharedResolving[refreshSlug] === 'adding' : undefined}
          roomRects={fFits ? roomFreeRects : null}
        />
      )
    }
    if (it.kind === 'remote')
      return (
        <RemoteCard
          key={gridItemId(it)}
          entry={it.entry}
          staggerIndex={staggerIndex}
          onResolved={(id) => setActiveDefId(id)}
        />
      )
    return (
      <SharedCard
        key={gridItemId(it)}
        item={it.item}
        staggerIndex={staggerIndex}
        onResolved={(id) => setActiveDefId(id)}
      />
    )
  }

  // Roving arrow-key navigation across the card grid. Column count is read from
  // the live layout (cards sharing the first row's offsetTop) so it adapts to
  // the responsive 1/2/3-column breakpoints. Only acts when a card itself holds
  // focus (nested heart/delete buttons keep their own Tab behaviour).
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const cells = [...e.currentTarget.querySelectorAll<HTMLElement>('.cat-card')]
    const idx = cells.indexOf(document.activeElement as HTMLElement)
    if (idx === -1 || cells.length === 0) return
    e.preventDefault()
    const top0 = cells[0].offsetTop
    const cols = Math.max(1, cells.filter((c) => c.offsetTop === top0).length)
    const delta =
      e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : -cols
    const next = idx + delta
    if (next >= 0 && next < cells.length) cells[next].focus()
  }

  // Mouse-follow radial gradient on catalog cards (P7, gated by useAmbientFx).
  // Event-driven — no continuous animation, so no IntersectionObserver needed:
  // when the gate is off the vars are never written and the gradient stays at
  // its inert `--mx/--my: 50%` default. The values are computed at runtime, so
  // there are no inline px literals.
  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ambientFx) return
    const card = (e.target as HTMLElement).closest<HTMLElement>('.cat-card')
    if (!card) return
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <aside
      className={`panel catalog dock-panel-left${planFurnishActive ? ' catalog-in-plan' : ''}${minimized ? ' minimized' : ''}`}
    >
      <SheetGrab minimized={minimized} swipeHandlers={catalogSwipe} label="catalog" />
      {/* Resizable dock on desktop/wide screens (mobile keeps the bottom-sheet). */}
      {fCatalogResize && !isMobile ? <CatalogResizeHandle /> : null}
      <div className="panel-head">
        <div className="panel-title">
          {view === 'layers' ? 'Objects' : view === 'packs' ? 'Packs' : 'Catalog'}
        </div>
        <div className="insp-head-btns">
          {/* Mobile: the category rail scrolls horizontally, which buries its
              leading sort control — surface the sort beside the filter funnel in
              the header instead (user request). Desktop keeps it on the rail. */}
          {view === 'catalog' && isMobile && !minimized && categorySortable && !q ? (
            <Select
              value={sortBy}
              onChange={(v) => {
                setSortBy(v as SortKey)
                setPage(0)
              }}
              ariaLabel="Sort catalog"
              iconTrigger={<Icon.Sort width={16} height={16} />}
              options={sortOptions}
            />
          ) : null}
          {view === 'catalog' && fCatalogFilters && !minimized ? (
            <CatalogFilterButton
              filter={effectiveFilter}
              onChange={(next) => {
                setFilter(next)
                setPage(0)
              }}
              showAvailability={hasDownloadable}
              favEnabled={fFavourites}
            />
          ) : null}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setCatalogMinimized((v) => !v)}
              className="icon-btn"
              aria-label={minimized ? 'Expand catalog' : 'Minimize catalog'}
              title={minimized ? 'Expand' : 'Minimize'}
            >
              {minimized ? (
                <Icon.Plus width={16} height={16} />
              ) : (
                <Icon.Minus width={16} height={16} />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="icon-btn"
            aria-label="Close catalog"
          >
            <Icon.Close width={16} height={16} />
          </button>
        </div>
      </div>
      {body.mounted ? (
        <div className={`sheet-collapse${body.collapsed ? ' collapsed' : ''}`}>
          <div className="sheet-collapse-inner">
            <div className="tabs">
              {(
                [
                  ['catalog', 'Catalog'],
                  ['layers', 'Layers'],
                  ...(proMode && fPacks ? ([['packs', 'Packs']] as const) : []),
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => selectView(v)}
                  className={`tab${view === v ? ' on' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'layers' ? (
              <LayersPanel />
            ) : view === 'packs' ? (
              <div
                className="panel-body"
                style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
              >
                <Suspense fallback={null}>
                  <PacksTab />
                </Suspense>
              </div>
            ) : (
              <>
                <div className="cat-search">
                  <div className="field">
                    <Icon.Search width={16} height={16} className="icn" />
                    <input
                      type="search"
                      aria-label="Search the furniture catalog"
                      value={query}
                      onChange={(e) => onSearch(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => {
                        setSearchFocused(false)
                        // Remember the term on click-away too (not just Enter), so a
                        // search you ran then clicked a result for is captured. Skip
                        // 1-char fragments; pushRecent de-dupes, so it's idempotent.
                        if (query.trim().length >= 2) setRecent(pushRecent(query))
                      }}
                      onKeyDown={(e) => {
                        // Esc clears a non-empty query (keeping focus to keep typing),
                        // else blurs the field — a quick way out of search.
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          if (query) onSearch('')
                          else e.currentTarget.blur()
                        } else if (e.key === 'Enter' && query.trim()) {
                          // Commit the term to recent searches (most-recent-first).
                          setRecent(pushRecent(query))
                        }
                      }}
                      placeholder={`Search ${totalCount} items…`}
                      className={q ? 'input has-clear' : 'input'}
                    />
                    {q ? (
                      <button
                        type="button"
                        className="icon-btn field-clear"
                        aria-label="Clear search"
                        onClick={() => onSearch('')}
                      >
                        <Icon.Close width={14} height={14} />
                      </button>
                    ) : null}
                  </div>
                  {q && allCards.length > 0 ? (
                    <div className="cat-count" aria-live="polite">
                      {allCards.length} {allCards.length === 1 ? 'match' : 'matches'}
                    </div>
                  ) : null}
                  {searchFocused && !q && recent.length > 0 ? (
                    <div className="cat-recent">
                      {recent.map((term) => (
                        <button
                          key={term}
                          type="button"
                          className="cat-recent-chip"
                          // Keep input focus through the click so the chip doesn't
                          // unmount on blur before the click registers.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onSearch(term)}
                        >
                          <Icon.Search width={11} height={11} />
                          {term}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="cat-recent-clear"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          clearRecent()
                          setRecent([])
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
                {q ? null : (
                  <CategoryTabs
                    active={active}
                    onSelect={selectCategory}
                    counts={unified.counts}
                    favCount={unified.favourites.length}
                    recentCount={unified.recent.length}
                    favEnabled={fFavourites}
                    sort={
                      // Mobile hosts the sort in the panel header beside the
                      // filter funnel instead (see .insp-head-btns above).
                      categorySortable && !isMobile
                        ? {
                            value: sortBy,
                            onChange: (v) => {
                              setSortBy(v)
                              setPage(0)
                            },
                            options: sortOptions,
                          }
                        : undefined
                    }
                  />
                )}
                {!q && categorySortable && priceOn ? (
                  <div className="cat-sort">
                    <span className="cat-sort-label">Max&nbsp;$</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={maxPrice}
                      aria-label="Maximum price (SGD)"
                      placeholder="any"
                      onChange={(e) => {
                        setMaxPrice(e.target.value)
                        setPage(0)
                      }}
                      className="input mono cat-sort-price"
                    />
                    {maxPrice.trim() !== '' ? (
                      <button
                        type="button"
                        aria-label="Clear max price"
                        title="Clear max price"
                        onClick={() => {
                          setMaxPrice('')
                          setPage(0)
                        }}
                        className="icon-btn cat-sort-clear"
                      >
                        <Icon.Close width={12} height={12} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {!q && fFitsFilter && roomFreeRects ? (
                  <div className="cat-sort">
                    <label className="cat-fits-only">
                      <input
                        type="checkbox"
                        checked={fitsOnly}
                        aria-label="Show only items that fit this room"
                        onChange={(e) => {
                          setFitsOnly(e.target.checked)
                          setPage(0)
                        }}
                      />
                      <span>Fits only</span>
                    </label>
                  </div>
                ) : null}
                {q && cards.length > 0 && matchedIntents(query).length > 0 ? (
                  <div className="catalog-search-hint">
                    Showing {matchedIntents(query).join(' & ')} furniture
                  </div>
                ) : null}
                <div
                  ref={gridRef}
                  className={`card-grid stagger-in${ambientFx ? ' fx' : ''}`}
                  onKeyDown={onGridKeyDown}
                  onPointerMove={onGridPointerMove}
                >
                  {cards.length === 0 ? (
                    q ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Search}
                        title="No matches found"
                        description={`Nothing in the catalog matches “${query.trim()}”.`}
                        cta={{ label: 'Clear search', onClick: () => onSearch('') }}
                      />
                    ) : active === 'favourites' ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Heart}
                        title="No favourites yet"
                        description="Tap the heart on any card to save it here for quick access."
                        cta={{
                          label: 'Browse furniture',
                          onClick: () => selectCategory(firstBrowsableCategory),
                        }}
                      />
                    ) : active === 'recent' ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Time}
                        title="Nothing placed yet"
                        description="Items you add appear here for quick reuse."
                        cta={{
                          label: 'Browse furniture',
                          onClick: () => selectCategory(firstBrowsableCategory),
                        }}
                      />
                    ) : maxPrice.trim() && baseCards.length > 0 ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Budget}
                        title="Nothing in budget"
                        description={`No items here under $${maxPrice.trim()}. Raise the Max $ filter to see more.`}
                        cta={{
                          label: 'Clear max price',
                          onClick: () => {
                            setMaxPrice('')
                            setPage(0)
                          },
                        }}
                      />
                    ) : fitsOnlyActive && priceFiltered.length > 0 ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Measure}
                        title="Nothing fits this room"
                        description="Every item here is flagged too big for the free space. Turn off “Fits only” to see them anyway."
                        cta={{
                          label: 'Show everything',
                          onClick: () => {
                            setFitsOnly(false)
                            setPage(0)
                          },
                        }}
                      />
                    ) : catFilterActive && preFilterCards.length > 0 ? (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Filter}
                        title="No items match your filters"
                        description="Nothing here matches the current catalog filters."
                        cta={{
                          label: 'Reset to All',
                          onClick: () => {
                            setFilter(DEFAULT_CATALOG_FILTER)
                            setPage(0)
                          },
                        }}
                      />
                    ) : (
                      <EmptyState
                        className="catalog-empty"
                        icon={Icon.Catalog}
                        title="No items here yet"
                        description="This category is empty — try another tab."
                        cta={{
                          label: 'Browse furniture',
                          onClick: () => selectCategory(firstBrowsableCategory),
                        }}
                      />
                    )
                  ) : (
                    cards.map((it, i) => renderCard(it, i))
                  )}
                </div>
                {pageCount > 1 ? (
                  <div className="pager">
                    <button
                      type="button"
                      onClick={() => goToPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                    >
                      ← Prev
                    </button>
                    <span>
                      Page {safePage + 1} of {pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={safePage >= pageCount - 1}
                    >
                      Next →
                    </button>
                  </div>
                ) : null}
                <StampBanner />
                <div className="cat-foot">
                  <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                    {fParametric ? (
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => setParametricOpen(true)}
                        title="Generate a shelf / wardrobe / sideboard to exact dimensions"
                        icon={<Icon.Measure width={14} height={14} />}
                      >
                        Custom size
                      </Button>
                    ) : null}
                    {fGlbDesigner ? (
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => setGlbDesignerOpen(true)}
                        title="Design or edit a custom 3D asset"
                        icon={<Icon.Cube width={14} height={14} />}
                      >
                        Design
                      </Button>
                    ) : null}
                    {fUpload ? (
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => setUploadOpen(true)}
                        icon={<Icon.Upload width={14} height={14} />}
                      >
                        Upload
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {uploadOpen && (
        <Suspense fallback={null}>
          <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </Suspense>
      )}
      {/* ThumbnailHost is mounted app-wide (App.tsx) so the inspector's own
          thumbnail (bug #3) resolves even when the catalog is closed/minimized —
          a single host drains the shared render queue for both surfaces. */}
    </aside>
  )
}
