import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { useCatalogByCategory } from '../../furniture/catalog';
import type { FurnitureCategory } from '../../furniture/types';
import { CategoryTabs } from './CategoryTabs';
import { CatalogCard } from './CatalogCard';
import { UploadModelDialog } from '../upload/UploadModelDialog';
import { RemoteBrowseTab } from './RemoteBrowseTab';

type Mode = 'builtin' | 'browse-furniture' | 'browse-materials';

/** Sliding left-side drawer. Toggle via toolbar or the C key (handled
 *  in App.tsx). Click a card to drop the item near the L/D centre and
 *  open the inspector — this is the simpler alternative to drag-place
 *  ghost which we revisit when the gizmo lands. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen);
  const cameraMode = useStore((s) => s.cameraMode);
  const setOpen = useStore((s) => s.setCatalogOpen);
  const removeUserFurniture = useStore((s) => s.removeUserFurniture);
  const bootstrapRemote = useStore((s) => s.bootstrapRemoteCatalog);
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status);
  const byCategory = useCatalogByCategory();
  const [active, setActive] = useState<FurnitureCategory>('seating');
  const [mode, setMode] = useState<Mode>('builtin');
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (open && phStatus === 'idle') void bootstrapRemote();
  }, [open, phStatus, bootstrapRemote]);

  if (!open || cameraMode !== 'orbit') return null;
  const cards = byCategory[active] ?? [];

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
            ['browse-materials', 'Browse materials'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-2 py-1 ${
              mode === m
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {mode === 'builtin' ? (
        <>
          <CategoryTabs active={active} onSelect={setActive} byCategory={byCategory} />
          <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3">
            {cards.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-xs text-neutral-500">
                No items in this category yet.
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
          <footer className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-500">
            <span>
              Drag onto the floor. <kbd className="font-mono">R</kbd> rotates after drop.
            </span>
            <button
              onClick={() => setUploadOpen(true)}
              className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
            >
              Upload model…
            </button>
          </footer>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RemoteBrowseTab
            kind={mode === 'browse-furniture' ? 'furniture' : 'material'}
            onResolved={() => {
              // Switch to built-in tab so the user can place the resolved item
              // (it's already merged into the active catalog).
              setMode('builtin');
            }}
          />
        </div>
      )}
      <UploadModelDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </aside>
  );
}
