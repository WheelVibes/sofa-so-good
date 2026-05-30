import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { canPlace } from '../../collision/placement';
import { ParametricBody } from './ParametricBody';
import { GltfBody } from './GltfBody';
import { SourceLine } from './SourceLine';

/** A small numeric field that shows the live value but lets the user type a
 *  precise one; commits on blur / Enter (collision-checked by the caller). */
function PosField({
  label,
  value,
  step,
  onCommit,
  integer,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
  integer?: boolean;
}) {
  const fmt = (v: number) => (integer ? Math.round(v).toString() : v.toFixed(2));
  const [text, setText] = useState(fmt(value));
  // Re-sync when the underlying value changes (drag, rotate key, etc.) and
  // the field isn't being edited.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = Number(text);
    if (!Number.isNaN(v)) onCommit(v);
  };
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-full rounded border border-neutral-200 bg-white px-1 py-0.5 font-mono text-[11px] focus:border-neutral-400 focus:outline-none"
      />
    </label>
  );
}

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
  const flipItem = useStore((s) => s.flipItem);
  const toggleLock = useStore((s) => s.toggleLock);
  const pushHistory = useStore((s) => s.pushHistory);
  const flip = (axis: 'x' | 'z') => {
    pushHistory();
    flipItem(item!.id, axis);
  };

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

  const tryMove = (x: number, z: number) => {
    const st = useStore.getState();
    const it = st.items.find((i) => i.id === item.id);
    if (!it || Number.isNaN(x) || Number.isNaN(z)) return;
    if (canPlace({ ...it, position: [x, z] }, def, { others: st.items, defs: catalog, doors: st.doors })) {
      st.pushHistory();
      st.moveItem(it.id, [x, z]);
    }
  };
  const trySetRot = (deg: number) => {
    const st = useStore.getState();
    const it = st.items.find((i) => i.id === item.id);
    if (!it || Number.isNaN(deg)) return;
    const rot = (deg * Math.PI) / 180;
    if (canPlace({ ...it, rotation: rot }, def, { others: st.items, defs: catalog, doors: st.doors })) {
      st.pushHistory();
      st.rotateItem(it.id, rot);
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
      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <PosField label="X (m)" value={item.position[0]} step={0.05}
          onCommit={(v) => tryMove(v, item.position[1])} />
        <PosField label="Z (m)" value={item.position[1]} step={0.05}
          onCommit={(v) => tryMove(item.position[0], v)} />
        <PosField label="Rot°" value={(item.rotation * 180) / Math.PI} step={15}
          onCommit={trySetRot} integer />
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
      <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-neutral-200 pt-2">
        <button
          onClick={() => flip('x')}
          disabled={item.locked}
          title="Flip left ↔ right (F)"
          className={`rounded py-1 enabled:hover:bg-neutral-200 disabled:opacity-40 ${item.flipX ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-700'}`}
        >
          ⇆ Flip H
        </button>
        <button
          onClick={() => flip('z')}
          disabled={item.locked}
          title="Flip front ↔ back (Shift+F)"
          className={`rounded py-1 enabled:hover:bg-neutral-200 disabled:opacity-40 ${item.flipZ ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-700'}`}
        >
          ⇅ Flip V
        </button>
      </div>
      <button
        onClick={() => toggleLock(item.id)}
        title="Lock pins the item so it can't be moved, rotated or deleted"
        className={`mt-1.5 w-full rounded py-1 hover:opacity-90 ${item.locked ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-700'}`}
      >
        {item.locked ? '🔒 Locked — click to unlock' : '🔓 Lock in place'}
      </button>
      <footer className="mt-1.5 grid grid-cols-3 gap-1.5 pt-0">
        <button
          onClick={rotate90}
          disabled={item.locked}
          title="Rotate 90° (R)"
          className="rounded bg-neutral-100 py-1 text-neutral-700 enabled:hover:bg-neutral-200 disabled:opacity-40"
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
          onClick={() => !item.locked && deleteItem(item.id)}
          disabled={item.locked}
          title="Delete (Del)"
          className="rounded bg-rose-50 py-1 text-rose-700 enabled:hover:bg-rose-100 disabled:opacity-40"
        >
          🗑 Delete
        </button>
      </footer>
    </aside>
  );
}
