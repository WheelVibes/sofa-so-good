import { useState } from 'react';
import { useStore } from '../../state/store';
import { useCatalog, useCatalogByCategory } from '../../furniture/catalog';
import type { FurnitureCategory } from '../../furniture/types';
import { CategoryTabs } from './CategoryTabs';
import { CatalogCard } from './CatalogCard';
import { spawnFromDef } from './spawn';

/** Sliding left-side drawer. Toggle via toolbar or the C key (handled
 *  in App.tsx). Click a card to drop the item near the L/D centre and
 *  open the inspector — this is the simpler alternative to drag-place
 *  ghost which we revisit when the gizmo lands. */
export function CatalogDrawer() {
  const open = useStore((s) => s.catalogOpen);
  const setOpen = useStore((s) => s.setCatalogOpen);
  const removeUserFurniture = useStore((s) => s.removeUserFurniture);
  const byCategory = useCatalogByCategory();
  const catalog = useCatalog();
  const [active, setActive] = useState<FurnitureCategory>('seating');

  if (!open) return null;
  const cards = byCategory[active] ?? [];

  return (
    <aside className="absolute left-3 top-3 z-10 flex w-72 max-h-[80vh] flex-col rounded-lg bg-white/95 text-neutral-700 shadow">
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
              onSpawn={() => spawnFromDef(def, catalog)}
              onDelete={() => removeUserFurniture(def.id)}
            />
          ))
        )}
      </div>
      <footer className="border-t border-neutral-200 px-4 py-2 text-[10px] text-neutral-500">
        Click an item to add it near the living/dining centre. Use the
        inspector or <kbd className="font-mono">R</kbd> to rotate.
      </footer>
    </aside>
  );
}
