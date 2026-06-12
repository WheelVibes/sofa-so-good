import { lazy, Suspense, useEffect, useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { CatalogCard } from './CatalogCard'
import { type CatalogCategory, CategoryTabs } from './CategoryTabs'
import { filterByMaxPrice, SORT_LABEL, type SortKey, sortCards } from './catalogBrowse'
import { fuzzySearch } from './fuzzySearch'
import { LayersPanel } from './LayersPanel'
import { RemoteCard } from './RemoteCard'

// Lazy-loaded: the packs tab (pack install pipeline + unzip + thumbnail
// renderer) and the model upload dialog (format converters + optimize pass)
// are only needed once the user opens them, so they stay out of the boot
// bundle (P-CHUNK). The upload dialog resets its state on close anyway, so
// mount-gating it on `uploadOpen` is behaviour-identical.
const PacksTab = lazy(() => import('./PacksTab').then((m) => ({ default: m.PacksTab })))
const UploadModelDialog = lazy(() =>
  import('../upload/UploadModelDialog').then((m) => ({ default: m.UploadModelDialog })),
)

import { ThumbnailHost } from './thumbnails'
import { type GridItem, gridItemId, useUnifiedCatalog } from './useUnifiedCatalog'

type Mode = 'catalog' | 'packs'

/** Cards per page in the catalog grid (2-col layout → 12 = 6 rows). */
const PAGE_SIZE = 12

/** Text fields a card is searched over (local def vs. remote CC0 entry). */
function gridItemText(it: GridItem): string[] {
  return it.kind === 'local'
    ? [it.def.name, ...(it.def.keywords ?? [])]
    : [it.entry.name, it.entry.slug, ...(it.entry.tags ?? [])]
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
  const setOpen = useStore((s) => s.setCatalogOpen)
  const leftMode = useStore((s) => s.leftMode)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const removeUserFurniture = useStore((s) => s.removeUserFurniture)
  const setActiveDefId = useStore((s) => s.setActiveDefId)
  const isPro = useStore((s) => s.uiMode === 'pro')
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
  const unified = useUnifiedCatalog()
  const [active, setActive] = useState<CatalogCategory>(() => loadBrowsePrefs().active)
  const [mode, setMode] = useState<Mode>('catalog')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>(() => loadBrowsePrefs().sortBy)
  const [maxPrice, setMaxPrice] = useState('')

  useEffect(() => {
    if (open && phStatus === 'idle') void bootstrapRemote()
  }, [open, phStatus, bootstrapRemote])

  // Persist the browse category + sort (best-effort) so the drawer reopens where
  // the user left off.
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ active, sortBy }))
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }, [active, sortBy])

  // Reset to page 1 when the visible list changes; the render also clamps.
  const selectCategory = (c: CatalogCategory) => {
    setActive(c)
    setPage(0)
  }
  const onSearch = (v: string) => {
    setQuery(v)
    setPage(0)
  }

  // Placing/customising furniture is editing, so the catalog only shows inside
  // the per-room editor (orbit). Orbit-over-the-flat and walk are view-only.
  if (!open || cameraMode !== 'orbit' || !roomEditorActive) return null
  const q = query.trim()
  // Fuzzy (typo-tolerant, ranked) search across the WHOLE catalog (local +
  // browsable CC0) when querying; otherwise the active category / favourites.
  const baseCards = q
    ? // Searching uses the fuzzy relevance ranking — sort is for browsing only.
      fuzzySearch(q, unified.all, gridItemText)
    : active === 'favourites'
      ? unified.favourites
      : active === 'recent'
        ? unified.recent
        : sortCards(unified.byCategory[active] ?? [], sortBy)
  // Optional max-price filter — browse-only (its control lives in the browse
  // sort row), so a stale cap can never silently filter search results.
  const allCards = q ? baseCards : filterByMaxPrice(baseCards, maxPrice)

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

  const renderCard = (it: GridItem) =>
    it.kind === 'local' ? (
      <CatalogCard
        key={gridItemId(it)}
        def={it.def}
        onDelete={() => removeUserFurniture(it.def.id)}
      />
    ) : (
      <RemoteCard key={gridItemId(it)} entry={it.entry} onResolved={(id) => setActiveDefId(id)} />
    )

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

  return (
    <aside className="panel catalog">
      <div className="panel-head">
        <div className="panel-title">
          {view === 'layers' ? 'Objects' : view === 'packs' ? 'Packs' : 'Catalog'}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="icon-btn"
          aria-label="Close catalog"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
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
                value={query}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Esc clears a non-empty query (keeping focus to keep typing),
                  // else blurs the field — a quick way out of search.
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    if (query) onSearch('')
                    else e.currentTarget.blur()
                  }
                }}
                placeholder={`Search ${totalCount} items…`}
                className="input"
              />
            </div>
          </div>
          {q ? null : (
            <CategoryTabs
              active={active}
              onSelect={selectCategory}
              counts={unified.counts}
              favCount={unified.favourites.length}
              recentCount={unified.recent.length}
            />
          )}
          {!q &&
          active !== 'favourites' &&
          active !== 'recent' &&
          (unified.byCategory[active]?.length ?? 0) > 1 ? (
            <div
              className="cat-sort"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 var(--s-4) var(--s-2)',
                fontSize: 'var(--t-2xs)',
                color: 'var(--text-3)',
              }}
            >
              <span>Sort</span>
              <select
                value={sortBy}
                aria-label="Sort catalog"
                onChange={(e) => {
                  setSortBy(e.target.value as SortKey)
                  setPage(0)
                }}
                className="input"
                style={{ flex: 1, height: 28, padding: '0 6px' }}
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
              <span style={{ marginLeft: 4 }}>Max&nbsp;$</span>
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
                className="input mono"
                style={{ width: 64, height: 28, padding: '0 6px' }}
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
                  className="icon-btn"
                  style={{ width: 24, height: 24, flex: 'none' }}
                >
                  <Icon.Close width={12} height={12} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="card-grid" onKeyDown={onGridKeyDown}>
            {cards.length === 0 ? (
              <p className="empty-mini" style={{ gridColumn: '1 / -1' }}>
                <span>
                  {q
                    ? `No matches for “${query.trim()}”.`
                    : active === 'favourites'
                      ? 'No favourites yet — tap the heart on any card to save it here.'
                      : active === 'recent'
                        ? 'Nothing placed yet — items you add will appear here for quick reuse.'
                        : maxPrice.trim() && baseCards.length > 0
                          ? `Nothing under $${maxPrice.trim()} here — raise the Max $ filter.`
                          : 'No items in this category yet.'}
                </span>
              </p>
            ) : (
              cards.map(renderCard)
            )}
          </div>
          {pageCount > 1 ? (
            <div className="pager">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                ← Prev
              </button>
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
              >
                Next →
              </button>
            </div>
          ) : null}
          <div className="cat-foot">
            <span className="hint">
              Drag onto the floor · <kbd>R</kbd> rotates
            </span>
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              {fParametric ? (
                <button
                  type="button"
                  onClick={() => setParametricOpen(true)}
                  className="btn btn-soft btn-sm"
                  title="Generate a shelf / wardrobe / sideboard to exact dimensions"
                >
                  <Icon.Measure width={14} height={14} />
                  Custom size
                </button>
              ) : null}
              {isPro ? (
                <button
                  type="button"
                  onClick={() => setGlbDesignerOpen(true)}
                  className="btn btn-soft btn-sm"
                  title="Design or edit a custom 3D asset"
                >
                  <Icon.Cube width={14} height={14} />
                  Design
                </button>
              ) : null}
              {fUpload ? (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="btn btn-soft btn-sm"
                >
                  <Icon.Upload width={14} height={14} />
                  Upload
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
      {uploadOpen && (
        <Suspense fallback={null}>
          <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
        </Suspense>
      )}
      <ThumbnailHost />
    </aside>
  )
}
