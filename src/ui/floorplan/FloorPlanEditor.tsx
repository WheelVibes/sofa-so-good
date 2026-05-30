import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '../../state/store';
import { planRoomArea, planTotalArea, wallLength } from '../../floorplan/types';
import type { PlanOpening, PlanWall } from '../../floorplan/types';
import { PlanInspector } from './PlanInspector';

type Tool = 'select' | 'wall' | 'room' | 'door' | 'window';

const PAD = 0.6; // metres of margin around the plan in the view
const MAX_W = 940;
const MAX_H = 620;

/**
 * 2D top-down Floor Plan Editor. Edits the active `floorPlan` in the store:
 * draw interior/exterior walls, rectangular rooms (auto area), and doors /
 * windows on walls. Coordinates are metres; drawing snaps to the grid size.
 * The 3D apartment renders whatever plan is active here.
 */
export function FloorPlanEditor() {
  const editing = useStore((s) => s.floorPlanEditing);
  const plan = useStore((s) => s.floorPlan);
  const gridSize = useStore((s) => s.gridSize);
  const sel = useStore((s) => s.planSelection);
  const a = useStore.getState();

  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<{ x0: number; z0: number; x: number; z: number } | null>(null);
  // Active room drag (select tool): grab offset from the room origin.
  const [moving, setMoving] = useState<{ id: string; gx: number; gz: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [ew, ed] = plan.extent;
  const PX = useMemo(() => {
    const fitW = MAX_W / (ew + PAD * 2);
    const fitH = MAX_H / (ed + PAD * 2);
    return Math.max(24, Math.min(fitW, fitH, 80));
  }, [ew, ed]);
  const W = (ew + PAD * 2) * PX;
  const H = (ed + PAD * 2) * PX;
  const toPx = (m: number) => (m + PAD) * PX;
  const snap = (m: number) => (gridSize > 0 ? Math.round(m / gridSize) * gridSize : m);

  // Esc closes; Delete removes the selected element.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(null);
        useStore.getState().setFloorPlanEditing(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        const st = useStore.getState();
        if (sel.type === 'wall') st.removeWall(sel.id);
        else if (sel.type === 'room') st.removeRoom(sel.id);
        else st.removeOpening(sel.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, sel]);

  if (!editing) return null;

  const pointerWorld = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    let wx = snap(x / PX - PAD);
    let wz = snap(y / PX - PAD);
    // Vertex snap: prefer an existing wall endpoint within ~0.3 m so walls
    // connect cleanly at corners.
    let best = 0.3;
    for (const w of plan.walls) {
      for (const p of [w.start, w.end]) {
        const dd = Math.hypot(p[0] - wx, p[1] - wz);
        if (dd < best) {
          best = dd;
          wx = p[0];
          wz = p[1];
        }
      }
    }
    return [wx, wz];
  };

  /** Find the nearest wall to a world point, with the projected offset along it. */
  const nearestWall = (wx: number, wz: number): { wall: PlanWall; offset: number; dist: number } | null => {
    let best: { wall: PlanWall; offset: number; dist: number } | null = null;
    for (const wall of plan.walls) {
      const dx = wall.end[0] - wall.start[0];
      const dz = wall.end[1] - wall.start[1];
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;
      const t = ((wx - wall.start[0]) * dx + (wz - wall.start[1]) * dz) / (len * len);
      const ct = Math.max(0, Math.min(1, t));
      const px = wall.start[0] + ct * dx;
      const pz = wall.start[1] + ct * dz;
      const dist = Math.hypot(wx - px, wz - pz);
      if (!best || dist < best.dist) best = { wall, offset: ct * len, dist };
    }
    return best && best.dist < 0.4 ? best : null;
  };

  const onDown = (e: React.PointerEvent) => {
    const [wx, wz] = pointerWorld(e);
    const st = useStore.getState();
    if (tool === 'wall' || tool === 'room') {
      setDraft({ x0: wx, z0: wz, x: wx, z: wz });
    } else if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(wx, wz);
      if (hit) {
        const width = tool === 'door' ? 0.9 : 1.2;
        const offset = Math.max(0, Math.min(wallLength(hit.wall) - width, hit.offset - width / 2));
        const id = st.addOpening({
          kind: tool,
          wallId: hit.wall.id,
          offset: snap(offset),
          width,
          sill: tool === 'door' ? 0 : 0.95,
          head: tool === 'door' ? 2.1 : 2.1,
        });
        st.setPlanSelection({ type: 'opening', id });
      }
    } else {
      st.setPlanSelection(null);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (moving) {
      const [wx, wz] = pointerWorld(e);
      useStore.getState().updateRoom(moving.id, { origin: [snap(wx - moving.gx), snap(wz - moving.gz)] });
      return;
    }
    if (!draft) return;
    const [wx, wz] = pointerWorld(e);
    setDraft({ ...draft, x: wx, z: wz });
  };

  const onUp = () => {
    if (moving) {
      setMoving(null);
      return;
    }
    if (!draft) return;
    const st = useStore.getState();
    if (tool === 'wall') {
      if (Math.hypot(draft.x - draft.x0, draft.z - draft.z0) > 0.2) {
        const id = st.addWall({ start: [draft.x0, draft.z0], end: [draft.x, draft.z], thickness: 'internal' });
        st.setPlanSelection({ type: 'wall', id });
      }
    } else if (tool === 'room') {
      const x = Math.min(draft.x0, draft.x);
      const z = Math.min(draft.z0, draft.z);
      const w = Math.abs(draft.x - draft.x0);
      const d = Math.abs(draft.z - draft.z0);
      if (w > 0.3 && d > 0.3) {
        const n = st.floorPlan.rooms.length + 1;
        const id = st.addRoom({ name: `Room ${n}`, origin: [x, z], width: w, depth: d });
        st.setPlanSelection({ type: 'room', id });
      }
    }
    setDraft(null);
  };

  const openingPoint = (o: PlanOpening): { x: number; z: number; wall: PlanWall } | null => {
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) return null;
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const len = Math.hypot(dx, dz) || 1;
    const t = (o.offset + o.width / 2) / len;
    return { x: wall.start[0] + dx * t, z: wall.start[1] + dz * t, wall };
  };

  const total = planTotalArea(plan);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-neutral-900/95 text-neutral-100">
      {/* Header / toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-700 px-4 py-2 text-sm">
        <span className="font-semibold">Floor Plan Editor</span>
        <input
          value={plan.name}
          onChange={(e) => a.updateFloorPlanMeta({ name: e.target.value })}
          className="w-48 rounded bg-neutral-800 px-2 py-1 text-xs"
        />
        <div className="mx-2 flex gap-1">
          {(['select', 'wall', 'room', 'door', 'window'] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`rounded px-2.5 py-1 text-xs capitalize ${tool === t ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            // Fresh apartment: clear the inherited furniture (undoable) so the
            // new shell starts empty rather than full of the old layout.
            a.pushHistory();
            a.setItems([]);
            a.newFloorPlan();
          }}
          title="Start a fresh, empty apartment shell"
          className="rounded bg-neutral-800 px-2.5 py-1 text-xs hover:bg-neutral-700"
        >
          New
        </button>
        <button onClick={() => a.resetFloorPlan()} className="rounded bg-neutral-800 px-2.5 py-1 text-xs hover:bg-neutral-700">
          Reset to HDB
        </button>
        <PlanLibrary />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            Total: <span className="font-semibold text-neutral-100">{total.toFixed(1)} m²</span> · {plan.rooms.length} rooms
          </span>
          <button
            onClick={() => a.setFloorPlanEditing(false)}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          <svg
            ref={svgRef}
            width={W}
            height={H}
            className="touch-none rounded bg-neutral-800 shadow-lg"
            style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <GridLines W={W} H={H} PX={PX} gridSize={gridSize} pad={PAD} ew={ew} ed={ed} />

            {/* Rooms */}
            {plan.rooms.map((r) => {
              const isSel = sel?.type === 'room' && sel.id === r.id;
              return (
                <g
                  key={r.id}
                  style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                  onPointerDown={(e) => {
                    if (tool !== 'select') return;
                    e.stopPropagation();
                    const [wx, wz] = pointerWorld(e);
                    a.setPlanSelection({ type: 'room', id: r.id });
                    setMoving({ id: r.id, gx: wx - r.origin[0], gz: wz - r.origin[1] });
                    svgRef.current?.setPointerCapture(e.pointerId);
                  }}
                >
                  <rect
                    x={toPx(r.origin[0])}
                    y={toPx(r.origin[1])}
                    width={r.width * PX}
                    height={r.depth * PX}
                    fill={isSel ? 'rgba(59,130,246,0.28)' : 'rgba(148,163,184,0.16)'}
                    stroke={isSel ? '#60a5fa' : '#64748b'}
                    strokeDasharray="4 3"
                  />
                  {r.extension && (
                    <rect
                      x={toPx(r.origin[0] + r.extension.offset[0])}
                      y={toPx(r.origin[1] + r.extension.offset[1])}
                      width={r.extension.width * PX}
                      height={r.extension.depth * PX}
                      fill={isSel ? 'rgba(59,130,246,0.28)' : 'rgba(148,163,184,0.16)'}
                      stroke={isSel ? '#60a5fa' : '#64748b'}
                      strokeDasharray="4 3"
                    />
                  )}
                  <text
                    x={toPx(r.origin[0] + r.width / 2)}
                    y={toPx(r.origin[1] + r.depth / 2)}
                    textAnchor="middle"
                    className="select-none"
                    fontSize={11}
                    fill="#e2e8f0"
                  >
                    <tspan x={toPx(r.origin[0] + r.width / 2)}>{r.name}</tspan>
                    <tspan x={toPx(r.origin[0] + r.width / 2)} dy={14} fill="#94a3b8">
                      {planRoomArea(r).toFixed(1)} m²
                    </tspan>
                  </text>
                </g>
              );
            })}

            {/* Walls */}
            {plan.walls.map((w) => {
              const isSel = sel?.type === 'wall' && sel.id === w.id;
              return (
                <line
                  key={w.id}
                  x1={toPx(w.start[0])}
                  y1={toPx(w.start[1])}
                  x2={toPx(w.end[0])}
                  y2={toPx(w.end[1])}
                  stroke={isSel ? '#60a5fa' : w.thickness === 'external' ? '#e5e7eb' : '#9ca3af'}
                  strokeWidth={w.thickness === 'external' ? 7 : 4}
                  strokeLinecap="round"
                  onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); a.setPlanSelection({ type: 'wall', id: w.id }); } }}
                  style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                />
              );
            })}

            {/* Openings */}
            {plan.openings.map((o) => {
              const p = openingPoint(o);
              if (!p) return null;
              const isSel = sel?.type === 'opening' && sel.id === o.id;
              const color = o.kind === 'door' ? '#f59e0b' : '#38bdf8';
              return (
                <circle
                  key={o.id}
                  cx={toPx(p.x)}
                  cy={toPx(p.z)}
                  r={isSel ? 7 : 5}
                  fill={color}
                  stroke={isSel ? '#fff' : 'none'}
                  strokeWidth={2}
                  onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); a.setPlanSelection({ type: 'opening', id: o.id }); } }}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}

            {/* Draft (in-progress draw) */}
            {draft && tool === 'wall' && (
              <line x1={toPx(draft.x0)} y1={toPx(draft.z0)} x2={toPx(draft.x)} y2={toPx(draft.z)} stroke="#22c55e" strokeWidth={4} strokeLinecap="round" />
            )}
            {draft && tool === 'room' && (
              <rect
                x={toPx(Math.min(draft.x0, draft.x))}
                y={toPx(Math.min(draft.z0, draft.z))}
                width={Math.abs(draft.x - draft.x0) * PX}
                height={Math.abs(draft.z - draft.z0) * PX}
                fill="rgba(34,197,94,0.2)"
                stroke="#22c55e"
              />
            )}
            {/* Live dimension readout while drawing. */}
            {draft && (
              <text x={toPx(draft.x) + 8} y={toPx(draft.z) - 8} fontSize={12} fill="#22c55e" className="select-none">
                {tool === 'wall'
                  ? `${Math.hypot(draft.x - draft.x0, draft.z - draft.z0).toFixed(2)} m`
                  : `${Math.abs(draft.x - draft.x0).toFixed(2)} × ${Math.abs(draft.z - draft.z0).toFixed(2)} m  (${(Math.abs(draft.x - draft.x0) * Math.abs(draft.z - draft.z0)).toFixed(1)} m²)`}
              </text>
            )}
          </svg>
        </div>

        {/* Inspector */}
        <PlanInspector />
      </div>
    </div>
  );
}

/** Save / load / delete named apartments (the plan library). */
function PlanLibrary() {
  const saved = useStore((s) => s.savedPlans);
  const plan = useStore((s) => s.floorPlan);
  const a = useStore.getState();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => a.saveCurrentPlan(plan.name)}
        title="Save this apartment to your library"
        className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600"
      >
        Save
      </button>
      {saved.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) a.loadSavedPlan(e.target.value);
          }}
          title="Load a saved apartment"
          className="rounded bg-neutral-800 px-1.5 py-1 text-xs text-neutral-200"
        >
          <option value="">Load… ({saved.length})</option>
          {saved.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {saved.some((p) => p.name === plan.name) && (
        <button
          onClick={() => {
            const m = saved.find((p) => p.name === plan.name);
            if (m) a.deleteSavedPlan(m.id);
          }}
          title="Delete this saved apartment from the library"
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-red-300 hover:bg-neutral-700"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function GridLines({ W, H, PX, gridSize, pad, ew, ed }: { W: number; H: number; PX: number; gridSize: number; pad: number; ew: number; ed: number }) {
  const g = gridSize > 0 ? gridSize : 0.5;
  const lines: React.ReactNode[] = [];
  for (let x = 0; x <= ew + 1e-6; x += g) {
    const major = Math.abs(x - Math.round(x)) < 1e-6;
    const px = (x + pad) * PX;
    lines.push(<line key={`vx${x}`} x1={px} y1={0} x2={px} y2={H} stroke={major ? '#475569' : '#3a4453'} strokeWidth={major ? 1 : 0.5} />);
  }
  for (let z = 0; z <= ed + 1e-6; z += g) {
    const major = Math.abs(z - Math.round(z)) < 1e-6;
    const py = (z + pad) * PX;
    lines.push(<line key={`hz${z}`} x1={0} y1={py} x2={W} y2={py} stroke={major ? '#475569' : '#3a4453'} strokeWidth={major ? 1 : 0.5} />);
  }
  return <g>{lines}</g>;
}
