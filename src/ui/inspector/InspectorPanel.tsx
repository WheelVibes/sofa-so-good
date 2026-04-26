import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { ParametricBody } from './ParametricBody';
import { GltfBody } from './GltfBody';

/** Right-side panel shown when an item is selected. Maps the selected
 *  def kind to either ParametricBody or GltfBody, plus a small header
 *  for category + position + delete. */
export function InspectorPanel() {
  const item = useStore(
    useShallow((s) => s.items.find((i) => i.id === s.selectedItemId) ?? null),
  );
  const catalog = useCatalog();
  const deleteItem = useStore((s) => s.deleteItem);
  const selectItem = useStore((s) => s.selectItem);

  if (!item) return null;
  const def = catalog[item.defId];
  if (!def) return null;

  return (
    <aside className="absolute right-3 top-3 z-10 w-64 max-h-[80vh] overflow-y-auto rounded-lg bg-white/95 p-4 text-xs text-neutral-700 shadow">
      <header className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{def.name}</div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">
            {def.category}
          </div>
        </div>
        <button
          onClick={() => selectItem(null)}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Close inspector"
        >
          ×
        </button>
      </header>
      <div className="mb-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-neutral-500">x</span>
        <span className="font-mono">{item.position[0].toFixed(2)} m</span>
        <span className="text-neutral-500">z</span>
        <span className="font-mono">{item.position[1].toFixed(2)} m</span>
        <span className="text-neutral-500">rot</span>
        <span className="font-mono">{((item.rotation * 180) / Math.PI).toFixed(0)}°</span>
      </div>
      {def.kind === 'parametric' ? (
        <ParametricBody item={item} def={def} />
      ) : (
        <GltfBody item={item} def={def} />
      )}
      <footer className="mt-3 border-t border-neutral-200 pt-2">
        <button
          onClick={() => deleteItem(item.id)}
          className="w-full rounded bg-rose-50 py-1 text-rose-700 hover:bg-rose-100"
        >
          Delete
        </button>
      </footer>
    </aside>
  );
}
