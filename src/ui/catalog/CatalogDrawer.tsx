import { useEffect, useState } from 'react'
import { useCatalogByCategory } from '../../furniture/catalog'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { UploadModelDialog } from '../upload/UploadModelDialog'
import { CatalogCard } from './CatalogCard'
import { CategoryTabs } from './CategoryTabs'
import { fuzzySearch } from './fuzzySearch'
import { PacksTab } from './PacksTab'
import { RemoteBrowseTab } from './RemoteBrowseTab'
import { ThumbnailHost } from './thumbnails'

type Mode = 'builtin' | 'browse-furniture' | 'packs'

/** Cards per page in the built-in catalog grid (2-col layout → 12 = 6 rows). */
const PAGE_SIZE = 12

/** Sliding left-side drawer. Toggle via toolbar or the C key (handled
 *  in App.tsx). Click a card to drop the item near the L/D centre and
 *  open the inspector — this is the simpler alternative to drag-place
 *  ghost which we revisit when the gizmo lands. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen)
  const cameraMode = useStore((s) => s.cameraMode)
  const setOpen = useStore((s) => s.setCatalogOpen)
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

  // Reset to page 1 when the visible list changes; both setters live here so the
  // page never lands out of range (the render also clamps via safePage).
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
  // Fuzzy (typo-tolerant, ranked best-first) search across name + keywords when
  // there's a query; otherwise just the active category.
  const allCards = q
    ? fuzzySearch(q, Object.values(byCategory).flat(), (d) => [d.name, ...(d.keywords ?? [])])
    : (byCategory[active] ?? [])

  // Paginate so a big category/search doesn't render hundreds of cards at once.
  const pageCount = Math.max(1, Math.ceil(allCards.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const cards = allCards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <aside className="absolute left-3 top-3 z-10 flex w-80 max-h-[85vh] flex-col rounded-lg bg-white/95 text-neutral-700 shadow">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-sm font-semibold text-neutral-900">Catalog</span>
        <button
          onClick={() => setOpen(false)}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Close catalog"
        >
          ×
        </button>
      </header>
      <nav className="flex gap-1 border-b border-neutral-200 px-3 py-2 text-[11px]">
        {(
          [
            ['builtin', 'Built-in'],
            ['browse-furniture', 'Browse furniture'],
            ['packs', 'Packs'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-2 py-1 ${
              mode === m ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {mode === 'builtin' ? (
        <>
          <div className="px-3 pt-2">
            <input
              type="search"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search furniture…"
              className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
          </div>
          {q ? null : (
            <CategoryTabs active={active} onSelect={selectCategory} byCategory={byCategory} />
          )}
          <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3">
            {cards.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-xs text-neutral-500">
                {q ? `No matches for “${query.trim()}”.` : 'No items in this category yet.'}
              </p>
            ) : (
              cards.map((def) => (
                <CatalogCard key={def.id} def={def} onDelete={() => removeUserFurniture(def.id)} />
              ))
            )}
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-600">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="rounded px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
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
                className="rounded px-2 py-0.5 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next →
              </button>
            </div>
          ) : null}
          <footer className="flex flex-col gap-1 border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-500">
            <div className="flex items-center justify-between">
              <span>
                Drag onto the floor. <kbd className="font-mono">R</kbd> rotates after drop.
              </span>
              <button
                onClick={() => setUploadOpen(true)}
                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
              >
                Upload model…
              </button>
            </div>
            <button
              onClick={() => setMode('browse-furniture')}
              className="text-left text-[10px] text-blue-700 hover:underline"
            >
              Want photoreal models? Browse free CC0 libraries →
            </button>
          </footer>
        </>
      ) : mode === 'packs' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <PacksTab />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RemoteBrowseTab
            kind="furniture"
            onResolved={() => {
              // Switch to built-in tab so the user can place the resolved item
              // (it's already merged into the active catalog).
              setMode('builtin')
            }}
          />
        </div>
      )}
      <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ThumbnailHost />
    </aside>
  )
}
