import { useEffect, useState } from 'react'
import { useCatalogByCategory } from '../../furniture/catalog'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { UploadModelDialog } from '../upload/UploadModelDialog'
import { CatalogCard } from './CatalogCard'
import { CategoryTabs } from './CategoryTabs'
import { fuzzySearch } from './fuzzySearch'
import { LayersPanel } from './LayersPanel'
import { PacksTab } from './PacksTab'
import { RemoteBrowseTab } from './RemoteBrowseTab'
import { ThumbnailHost } from './thumbnails'

type Mode = 'builtin' | 'browse-furniture' | 'packs'

/** Cards per page in the built-in catalog grid (2-col layout → 12 = 6 rows). */
const PAGE_SIZE = 12

/** Sliding left-side drawer. Toggles between the catalog grid and an
 *  Objects/Layers tree (`leftMode`). Toggle the drawer via toolbar or the C
 *  key. Click/drag a card to place it. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen)
  const cameraMode = useStore((s) => s.cameraMode)
  const setOpen = useStore((s) => s.setCatalogOpen)
  const leftMode = useStore((s) => s.leftMode)
  const setLeftMode = useStore((s) => s.setLeftMode)
  const removeUserFurniture = useStore((s) => s.removeUserFurniture)
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const byCategory = useCatalogByCategory()
  const [active, setActive] = useState<FurnitureCategory>('seating')
  const [mode, setMode] = useState<Mode>('builtin')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (open && phStatus === 'idle') void bootstrapRemote()
  }, [open, phStatus, bootstrapRemote])

  // Reset to page 1 when the visible list changes; the render also clamps.
  const selectCategory = (c: FurnitureCategory) => {
    setActive(c)
    setPage(0)
  }
  const onSearch = (v: string) => {
    setQuery(v)
    setPage(0)
  }

  if (!open || cameraMode !== 'orbit') return null
  const q = query.trim()
  // Fuzzy (typo-tolerant, ranked) search over name + keywords when querying;
  // otherwise just the active category.
  const allCards = q
    ? fuzzySearch(q, Object.values(byCategory).flat(), (d) => [d.name, ...(d.keywords ?? [])])
    : (byCategory[active] ?? [])

  // Paginate so a big category/search doesn't render hundreds of cards at once.
  const pageCount = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const cards = allCards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <aside className="panel catalog">
      <div className="panel-head">
        <div className="panel-title">{leftMode === 'layers' ? 'Objects' : 'Catalog'}</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="icon-btn"
          aria-label="Close catalog"
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <div className="left-modeseg">
        <div className="seg">
          <button
            type="button"
            className={leftMode === 'catalog' ? 'on' : ''}
            onClick={() => setLeftMode('catalog')}
          >
            Catalog
          </button>
          <button
            type="button"
            className={leftMode === 'layers' ? 'on' : ''}
            onClick={() => setLeftMode('layers')}
          >
            Layers
          </button>
        </div>
      </div>

      {leftMode === 'layers' ? (
        <LayersPanel />
      ) : (
        <>
          <div className="tabs">
            {(
              [
                ['builtin', 'Built-in'],
                ['browse-furniture', 'Browse CC0'],
                ['packs', 'Packs'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`tab${mode === m ? ' on' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'builtin' ? (
            <>
              <div className="cat-search">
                <div className="field">
                  <Icon.Search width={16} height={16} className="icn" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search 75+ items…"
                    className="input"
                  />
                </div>
              </div>
              {q ? null : (
                <CategoryTabs active={active} onSelect={selectCategory} byCategory={byCategory} />
              )}
              <div className="card-grid">
                {cards.length === 0 ? (
                  <p className="empty-mini" style={{ gridColumn: '1 / -1' }}>
                    <span>
                      {q ? `No matches for “${query.trim()}”.` : 'No items in this category yet.'}
                    </span>
                  </p>
                ) : (
                  cards.map((def) => (
                    <CatalogCard
                      key={def.id}
                      def={def}
                      onDelete={() => removeUserFurniture(def.id)}
                    />
                  ))
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
          ) : mode === 'packs' ? (
            <div
              className="panel-body"
              style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
            >
              <PacksTab />
            </div>
          ) : (
            <div
              className="panel-body"
              style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
            >
              <RemoteBrowseTab kind="furniture" onResolved={() => setMode('builtin')} />
            </div>
          )}
        </>
      )}
      <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ThumbnailHost />
    </aside>
  )
}
