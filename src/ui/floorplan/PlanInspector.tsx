import { useStore } from '../../state/store';
import { planRoomArea, wallLength } from '../../floorplan/types';
import { BUILTIN_MATERIALS_BY_CATEGORY } from '../../materials/builtinCatalog';

const FLOOR_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.floor ?? [];

/** Numeric field with a label, editing one metre value. */
function Num({ label, value, onChange, step = 0.1, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-neutral-400">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 rounded bg-neutral-800 px-2 py-1 text-right text-neutral-100"
      />
    </label>
  );
}

/** Right-hand inspector for the selected floor-plan element. */
export function PlanInspector() {
  const sel = useStore((s) => s.planSelection);
  const plan = useStore((s) => s.floorPlan);
  const a = useStore.getState();

  let body: React.ReactNode = (
    <p className="text-xs leading-relaxed text-neutral-400">
      Pick a tool and draw on the canvas, or select an element to edit it.
      <br />
      <br />
      <b className="text-neutral-300">Wall</b> — drag to draw. <b className="text-neutral-300">Room</b> — drag a
      rectangle (area is computed). <b className="text-neutral-300">Door / Window</b> — click on a wall.
      <br />
      <br />
      Drawing snaps to the grid (set the size with the toolbar Snap control). Press Delete to remove the selected
      element.
    </p>
  );

  if (sel?.type === 'room') {
    const r = plan.rooms.find((x) => x.id === sel.id);
    if (r)
      body = (
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">Name</span>
            <input
              value={r.name}
              onChange={(e) => a.updateRoom(r.id, { name: e.target.value })}
              className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
            />
          </label>
          <Num label="X (m)" value={r.origin[0]} onChange={(v) => a.updateRoom(r.id, { origin: [v, r.origin[1]] })} />
          <Num label="Z (m)" value={r.origin[1]} onChange={(v) => a.updateRoom(r.id, { origin: [r.origin[0], v] })} />
          <Num label="Width (m)" value={r.width} min={0.1} onChange={(v) => a.updateRoom(r.id, { width: Math.max(0.1, v) })} />
          <Num label="Depth (m)" value={r.depth} min={0.1} onChange={(v) => a.updateRoom(r.id, { depth: Math.max(0.1, v) })} />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-400">Floor finish</span>
            <select
              value={r.floor ?? 'floor-wood-oak'}
              onChange={(e) => a.updateRoom(r.id, { floor: e.target.value })}
              className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
            >
              {FLOOR_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded bg-neutral-800 px-2 py-1.5 text-xs">
            Area: <span className="font-semibold text-blue-300">{planRoomArea(r).toFixed(2)} m²</span>
          </div>
          <DeleteBtn onClick={() => a.removeRoom(r.id)} label="Delete room" />
        </div>
      );
  } else if (sel?.type === 'wall') {
    const w = plan.walls.find((x) => x.id === sel.id);
    if (w)
      body = (
        <div className="space-y-2">
          <div className="flex gap-1">
            {(['external', 'internal'] as const).map((t) => (
              <button
                key={t}
                onClick={() => a.updateWall(w.id, { thickness: t })}
                className={`flex-1 rounded px-2 py-1 text-xs capitalize ${w.thickness === t ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <Num label="Start X" value={w.start[0]} onChange={(v) => a.updateWall(w.id, { start: [v, w.start[1]] })} />
          <Num label="Start Z" value={w.start[1]} onChange={(v) => a.updateWall(w.id, { start: [w.start[0], v] })} />
          <Num label="End X" value={w.end[0]} onChange={(v) => a.updateWall(w.id, { end: [v, w.end[1]] })} />
          <Num label="End Z" value={w.end[1]} onChange={(v) => a.updateWall(w.id, { end: [w.end[0], v] })} />
          <div className="rounded bg-neutral-800 px-2 py-1.5 text-xs">
            Length: <span className="font-semibold text-blue-300">{wallLength(w).toFixed(2)} m</span>
          </div>
          <DeleteBtn onClick={() => a.removeWall(w.id)} label="Delete wall" />
        </div>
      );
  } else if (sel?.type === 'opening') {
    const o = plan.openings.find((x) => x.id === sel.id);
    if (o) {
      const wall = plan.walls.find((x) => x.id === o.wallId);
      const maxOff = wall ? Math.max(0, wallLength(wall) - o.width) : o.offset;
      body = (
        <div className="space-y-2">
          <div className="text-xs capitalize text-neutral-300">{o.kind}</div>
          <Num label="Offset (m)" value={o.offset} min={0} onChange={(v) => a.updateOpening(o.id, { offset: Math.max(0, Math.min(maxOff, v)) })} />
          <Num label="Width (m)" value={o.width} min={0.1} onChange={(v) => a.updateOpening(o.id, { width: Math.max(0.1, v) })} />
          <Num label="Sill (m)" value={o.sill} min={0} onChange={(v) => a.updateOpening(o.id, { sill: Math.max(0, v) })} />
          <Num label="Head (m)" value={o.head} min={0.1} onChange={(v) => a.updateOpening(o.id, { head: Math.max(0.1, v) })} />
          <DeleteBtn onClick={() => a.removeOpening(o.id)} label={`Delete ${o.kind}`} />
        </div>
      );
    }
  }

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-700 bg-neutral-900 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Properties</h3>
      {body}
    </aside>
  );
}

function DeleteBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="mt-1 w-full rounded bg-red-600/80 px-2 py-1 text-xs font-medium text-white hover:bg-red-600">
      {label}
    </button>
  );
}
