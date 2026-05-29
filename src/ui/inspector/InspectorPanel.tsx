import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { canPlace } from '../../collision/placement';
import { ParametricBody } from './ParametricBody';
import { GltfBody } from './GltfBody';
import { SourceLine } from './SourceLine';

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

  const rotate90 = () => {
    const st = useStore.getState();
    const it = st.items.find((i) => i.id === item.id);
    if (!it) return;
    const next = it.rotation + Math.PI / 2;
    if (canPlace({ ...it, rotation: next }, def, { others: st.items, defs: catalog, doors: st.doors })) {
      st.pushHistory();
      st.rotateItem(it.id, next);
    }
  };

  const duplicate = () => {
    const st = useStore.getState();
    const STEP = 0.3;
    for (let ring = 1; ring <= 8; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const pos: [number, number] = [item.position[0] + dx * STEP, item.position[1] + dz * STEP];
          const probe = { id: 'dup-probe', defId: item.defId, position: pos, rotation: item.rotation, props: item.props };
          if (canPlace(probe, def, { others: st.items, defs: catalog, doors: st.doors })) {
            st.addItem({ defId: item.defId, position: pos, rotation: item.rotation, props: { ...item.props } });
            return;
          }
        }
      }
    }
  };

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
      {def.kind === 'gltf' && def.source === 'builtin' && (
        <SourceLine
          attribution={def.attribution}
          license={def.license}
          sourceUrl={def.sourceUrl}
        />
      )}
      <footer className="mt-3 grid grid-cols-3 gap-1.5 border-t border-neutral-200 pt-2">
        <button
          onClick={rotate90}
          title="Rotate 90° (R)"
          className="rounded bg-neutral-100 py-1 text-neutral-700 hover:bg-neutral-200"
        >
          ↻ Rotate
        </button>
        <button
          onClick={duplicate}
          title="Duplicate (Ctrl+D)"
          className="rounded bg-neutral-100 py-1 text-neutral-700 hover:bg-neutral-200"
        >
          ⧉ Copy
        </button>
        <button
          onClick={() => deleteItem(item.id)}
          title="Delete (Del)"
          className="rounded bg-rose-50 py-1 text-rose-700 hover:bg-rose-100"
        >
          🗑 Delete
        </button>
      </footer>
    </aside>
  );
}
