import { useEffect, useState } from 'react'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { UploadModelDialog } from '../upload/UploadModelDialog'
import { CatalogCard } from './CatalogCard'
import { type CatalogCategory, CategoryTabs } from './CategoryTabs'
import { fuzzySearch } from './fuzzySearch'
import { LayersPanel } from './LayersPanel'
import { PacksTab } from './PacksTab'
import { RemoteCard } from './RemoteCard'
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

/** Sliding left-side drawer. Toggles between a single unified catalog grid
 *  (built-in + uploads + installed packs + browsable CC0) and an Objects/Layers
 *  tree (`leftMode`). The Packs tab installs asset packs (whose items then show
 *  in the unified grid). Click/drag a card to place it. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen)
  const cameraMode = useStore((s) => s.cameraMode)
  const setOpen = useStore((s) => s.setCatalogOpen)
  const leftMode = useStore((s) => s.leftMode)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const removeUserFurniture = useStore((s) => s.removeUserFurniture)
  const setActiveDefId = useStore((s) => s.setActiveDefId)
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const unified = useUnifiedCatalog()
  const [active, setActive] = useState<CatalogCategory>('seating')
  const [mode, setMode] = useState<Mode>('catalog')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (open && phStatus === 'idle') void bootstrapRemote()
  }, [open, phStatus, bootstrapRemote])

  // Reset to page 1 when the visible list changes; the render also clamps.
  const selectCategory = (c: CatalogCategory) => {
    setActive(c)
    setPage(0)
  }
  const onSearch = (v: string) => {
    setQuery(v)
    setPage(0)
  }

  if (!open || cameraMode !== 'orbit') return null
  const q = query.trim()
  // Fuzzy (typo-tolerant, ranked) search across the WHOLE catalog (local +
  // browsable CC0) when querying; otherwise the active category / favourites.
  const allCards = q
    ? fuzzySearch(q, unified.all, gridItemText)
    : active === 'favourites'
      ? unified.favourites
      : active === 'recent'
        ? unified.recent
        : (unified.byCategory[active] ?? [])

  // Paginate so a big category/search doesn't render hundreds of cards at once.
  const pageCount = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const cards = allCards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const totalCount = unified.all.length

  // One flat tab row: the catalog grid, the Objects/Layers tree (store-level
  // `leftMode`, shared with the command palette + mobile toolbar), and Packs.
  const view: 'catalog' | 'layers' | 'packs' =
    leftMode === 'layers' ? 'layers' : mode === 'packs' ? 'packs' : 'catalog'
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
            ['packs', 'Packs'],
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
          <PacksTab />
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
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="btn btn-soft btn-sm"
            >
              <Icon.Upload width={14} height={14} />
              Upload
            </button>
          </div>
        </>
      )}
      <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ThumbnailHost />
    </aside>
  )
}
