import { useState } from 'react'
import type { RoomId } from '../../apartment/types'
import { useFeature } from '../../features/useFeature'
import { doorHinge, doorSwing } from '../../floorplan/doorSwing'
import { levelById } from '../../floorplan/levels'
import { polylineLength } from '../../floorplan/polyline'
import {
  type CeilingConfig,
  type CeilingStyle,
  DEFAULT_PLAN_WALL_COLOR,
  planRoomArea,
  wallLength,
} from '../../floorplan/types'
import { BUILTIN_MATERIALS_BY_CATEGORY } from '../../materials/builtinCatalog'
import { useStore } from '../../state/store'
import { formatArea, formatLength } from '../../utils/measurement'
import { useIsMobile } from '../useIsMobile'

const FLOOR_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.floor ?? []
const WALL_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.wall ?? []

/** Numeric field with a label, editing one metre value. Holds the raw text while
 *  focused so the user can clear / type a partial value ("1.", "-") freely, and
 *  only commits a *finite* number — so a blank/NaN field never reaches the plan
 *  geometry (which would make a degenerate room/wall and break save/render). */
function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
}) {
  const committed = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : ''
  const [text, setText] = useState<string | null>(null)
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="label">{label}</span>
      <input
        type="number"
        // While focused (text !== null) show the raw input; otherwise the
        // committed value, so a re-render doesn't fight the user mid-edit.
        value={text ?? committed}
        step={step}
        min={min}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number.parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setText(null)}
        className="input mono"
        style={{ width: 96, textAlign: 'right' }}
      />
    </label>
  )
}

const CEILING_STYLES: { id: CeilingStyle; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'tray', label: 'Tray' },
  { id: 'coffered', label: 'Coffered' },
  { id: 'dropped', label: 'Dropped' },
]

/** Per-room ceiling-treatment editor: style picker + style-specific params +
 *  a perimeter cove-light toggle. Writes through `setRoomCeiling` (coalesced). */
function CeilingControls({
  roomId,
  style,
  config,
}: {
  roomId: string
  style: CeilingStyle
  config?: CeilingConfig
}) {
  const set = (patch: Partial<CeilingConfig> | null) =>
    useStore.getState().setRoomCeiling(roomId, patch)
  const drop = config?.drop ?? 0.15
  const margin = config?.margin ?? 0.35
  const grid = config?.grid ?? [2, 2]
  return (
    <>
      <div className="sec-h" style={{ marginTop: 'var(--s-2)' }}>
        <span>Ceiling style</span>
      </div>
      <div className="seg">
        {CEILING_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`seg-btn${style === s.id ? ' on' : ''}`}
            onClick={() => set(s.id === 'flat' ? null : { style: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      {style !== 'flat' ? (
        <>
          {style !== 'coffered' ? (
            <Num
              label="Border / inset (m)"
              value={margin}
              step={0.05}
              min={0.1}
              onChange={(v) => set({ margin: Math.max(0.1, v) })}
            />
          ) : null}
          <Num
            label="Depth (m)"
            value={drop}
            step={0.02}
            min={0.03}
            onChange={(v) => set({ drop: Math.max(0.03, Math.min(0.4, v)) })}
          />
          {style === 'coffered' ? (
            <div className="flex gap-2">
              <Num
                label="Columns"
                value={grid[0]}
                step={1}
                min={1}
                onChange={(v) => set({ grid: [Math.max(1, Math.round(v)), grid[1]] })}
              />
              <Num
                label="Rows"
                value={grid[1]}
                step={1}
                min={1}
                onChange={(v) => set({ grid: [grid[0], Math.max(1, Math.round(v))] })}
              />
            </div>
          ) : null}
          {style === 'tray' || style === 'dropped' ? (
            <label className="flex items-center gap-2" style={{ marginTop: 'var(--s-2)' }}>
              <input
                type="checkbox"
                checked={!!config?.coveLight}
                onChange={(e) => set({ coveLight: e.target.checked })}
              />
              <span>Cove light</span>
              {config?.coveLight ? (
                <input
                  type="color"
                  aria-label="Cove light colour"
                  value={config?.coveColor ?? '#ffe6c0'}
                  onChange={(e) => set({ coveColor: e.target.value })}
                  style={{ marginLeft: 'auto' }}
                />
              ) : null}
            </label>
          ) : null}
        </>
      ) : null}
    </>
  )
}

/** Right-hand inspector for the selected floor-plan element. Elements are
 *  looked up on (and edits routed to) the editor's active storey (F13/ML4b). */
export function PlanInspector({ levelId }: { levelId?: string }) {
  const sel = useStore((s) => s.planSelection)
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const a = useStore.getState()
  const isMobile = useIsMobile()
  const ceilingDesignOn = useFeature('ceilingDesign')
  // The active storey's geometry — selection ids come from the editor canvas,
  // which only ever shows (so only ever selects) active-level elements.
  const level = levelById(plan, levelId)

  let body: React.ReactNode = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="label">Ceiling height</span>
        <Num
          label="Height (m)"
          value={plan.ceilingHeight}
          step={0.05}
          min={2.2}
          onChange={(v) => {
            if (!Number.isFinite(v)) return
            // Clamp clear of the window head (2.1 m) so glazing never clips.
            a.updateFloorPlanMeta({ ceilingHeight: Math.min(4, Math.max(2.2, v)) })
          }}
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Applies to the whole home (bathrooms keep their lower dropped ceiling).
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">Wall colour</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Wall colour"
            value={plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR}
            onChange={(e) => a.updateFloorPlanMeta({ wallColor: e.target.value })}
            style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'none' }}
          />
          {plan.wallColor && plan.wallColor.toLowerCase() !== DEFAULT_PLAN_WALL_COLOR ? (
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => a.updateFloorPlanMeta({ wallColor: DEFAULT_PLAN_WALL_COLOR })}
            >
              Reset
            </button>
          ) : null}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Paints every wall in this plan.
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
        Pick a tool and draw on the canvas, or select an element to edit it.
        <br />
        <br />
        <b style={{ color: 'var(--text)' }}>Wall</b> — drag to draw.{' '}
        <b style={{ color: 'var(--text)' }}>Room</b> — drag a rectangle (area is computed).{' '}
        <b style={{ color: 'var(--text)' }}>Door / Window</b> — click on a wall.
        <br />
        <br />
        Drawing snaps to the grid (set the size with the toolbar Snap control). Press Delete to
        remove the selected element.
      </p>
    </div>
  )

  if (sel?.type === 'room') {
    const r = level.rooms.find((x) => x.id === sel.id)
    if (r)
      body = (
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Name</span>
            <input
              value={r.name}
              onChange={(e) => a.updateRoom(r.id, { name: e.target.value })}
              className="input"
            />
          </label>
          <Num
            label="X (m)"
            value={r.origin[0]}
            onChange={(v) => a.updateRoom(r.id, { origin: [v, r.origin[1]] })}
          />
          <Num
            label="Z (m)"
            value={r.origin[1]}
            onChange={(v) => a.updateRoom(r.id, { origin: [r.origin[0], v] })}
          />
          <Num
            label="Width (m)"
            value={r.width}
            min={0.1}
            onChange={(v) => a.updateRoom(r.id, { width: Math.max(0.1, v) })}
          />
          <Num
            label="Depth (m)"
            value={r.depth}
            min={0.1}
            onChange={(v) => a.updateRoom(r.id, { depth: Math.max(0.1, v) })}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Floor finish</span>
            <select
              value={r.floor ?? 'floor-wood-oak'}
              onChange={(e) =>
                // Routed through the finishes slice (not a bare updateRoom) so
                // the live finishes map stays in sync with the plan data.
                a.setFloorFinish(r.id as RoomId, e.target.value)
              }
              className="input"
            >
              {FLOOR_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Wall finish</span>
            <select
              value={r.wall ?? ''}
              onChange={(e) => {
                if (e.target.value) a.setWallFinish(r.id as RoomId, e.target.value)
                else a.clearWallFinish(r.id as RoomId)
              }}
              className="input"
            >
              <option value="">Plaster (default)</option>
              {WALL_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {/* Per-room ceiling height — overrides the home default for this room
              only (a dropped/false ceiling; walls stay full height, like the
              built-in 2.4 m bathrooms). Empty = inherit the home height. */}
          <div className="flex flex-col gap-1">
            <Num
              label="Ceiling (m)"
              value={r.ceilingHeight ?? plan.ceilingHeight}
              step={0.05}
              min={2.2}
              onChange={(v) => {
                if (!Number.isFinite(v)) return
                a.updateRoom(r.id, { ceilingHeight: Math.min(4, Math.max(2.2, v)) })
              }}
            />
            {r.ceilingHeight != null && (
              <button
                type="button"
                className="btn btn-block"
                onClick={() => a.updateRoom(r.id, { ceilingHeight: undefined })}
              >
                Match home ({formatLength(plan.ceilingHeight, units)})
              </button>
            )}
          </div>
          {ceilingDesignOn ? (
            <CeilingControls roomId={r.id} style={r.ceiling?.style ?? 'flat'} config={r.ceiling} />
          ) : null}
          {/* L-shape extension: a second rectangle offset from the origin.
              planRoomArea sums both, and the 3D shell renders both floors. */}
          <div className="sec-h" style={{ marginTop: 'var(--s-2)' }}>
            <span>L-shape extension</span>
          </div>
          {r.extension ? (
            <>
              <Num
                label="Offset X (m)"
                value={r.extension.offset[0]}
                onChange={(v) =>
                  a.updateRoom(r.id, {
                    extension: { ...r.extension!, offset: [v, r.extension!.offset[1]] },
                  })
                }
              />
              <Num
                label="Offset Z (m)"
                value={r.extension.offset[1]}
                onChange={(v) =>
                  a.updateRoom(r.id, {
                    extension: { ...r.extension!, offset: [r.extension!.offset[0], v] },
                  })
                }
              />
              <Num
                label="Width (m)"
                value={r.extension.width}
                min={0.1}
                onChange={(v) =>
                  a.updateRoom(r.id, {
                    extension: { ...r.extension!, width: Math.max(0.1, v) },
                  })
                }
              />
              <Num
                label="Depth (m)"
                value={r.extension.depth}
                min={0.1}
                onChange={(v) =>
                  a.updateRoom(r.id, {
                    extension: { ...r.extension!, depth: Math.max(0.1, v) },
                  })
                }
              />
              <button
                type="button"
                className="btn btn-block"
                onClick={() => a.updateRoom(r.id, { extension: undefined })}
              >
                Remove extension
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-block"
              onClick={() =>
                a.updateRoom(r.id, {
                  // Seed an extension off the room's far corner (an L notch).
                  extension: { offset: [r.width, 0], width: r.width / 2, depth: r.depth / 2 },
                })
              }
            >
              Make L-shaped
            </button>
          )}
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">Area</span>
            <span className="amt" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
              {formatArea(planRoomArea(r), units)}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-block"
            title="Close the plan editor and isolate this room in the 3D per-room editor"
            onClick={() => {
              const st = useStore.getState()
              st.setFloorPlanEditing(false)
              st.enterRoomEditor(r.id)
            }}
          >
            Edit in 3D
          </button>
          <DeleteBtn onClick={() => a.removeRoom(r.id, levelId)} label="Delete room" />
        </div>
      )
  } else if (sel?.type === 'wall') {
    const w = level.walls.find((x) => x.id === sel.id)
    if (w)
      body = (
        <div className="space-y-2">
          <div className="seg accent" style={{ display: 'flex' }}>
            {(['external', 'internal'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => a.updateWall(w.id, { thickness: t }, levelId)}
                className={`capitalize${w.thickness === t ? ' on' : ''}`}
                style={{ flex: 1 }}
              >
                {t}
              </button>
            ))}
          </div>
          <Num
            label="Start X"
            value={w.start[0]}
            onChange={(v) => a.updateWall(w.id, { start: [v, w.start[1]] }, levelId)}
          />
          <Num
            label="Start Z"
            value={w.start[1]}
            onChange={(v) => a.updateWall(w.id, { start: [w.start[0], v] }, levelId)}
          />
          <Num
            label="End X"
            value={w.end[0]}
            onChange={(v) => a.updateWall(w.id, { end: [v, w.end[1]] }, levelId)}
          />
          <Num
            label="End Z"
            value={w.end[1]}
            onChange={(v) => a.updateWall(w.id, { end: [w.end[0], v] }, levelId)}
          />
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">Length</span>
            <span className="amt" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
              {formatLength(wallLength(w), units)}
            </span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ flex: 1 }}
              title="Reverse this wall's direction (flips its sides / door-swing reference)"
              onClick={() => a.reverseWall(w.id, levelId)}
            >
              Reverse
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ flex: 1 }}
              title="Merge with a collinear neighbouring wall (inverse of Split)"
              onClick={() => a.joinWall(w.id, levelId)}
            >
              Join
            </button>
          </div>
          <DeleteBtn onClick={() => a.removeWall(w.id, levelId)} label="Delete wall" />
        </div>
      )
  } else if (sel?.type === 'opening') {
    const o = level.openings.find((x) => x.id === sel.id)
    if (o) {
      const wall = level.walls.find((x) => x.id === o.wallId)
      const maxOff = wall ? Math.max(0, wallLength(wall) - o.width) : o.offset
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span className="capitalize">{o.kind}</span>
          </div>
          <Num
            label="Offset (m)"
            value={o.offset}
            min={0}
            onChange={(v) =>
              a.updateOpening(o.id, { offset: Math.max(0, Math.min(maxOff, v)) }, levelId)
            }
          />
          <Num
            label="Width (m)"
            value={o.width}
            min={0.1}
            onChange={(v) => a.updateOpening(o.id, { width: Math.max(0.1, v) }, levelId)}
          />
          <Num
            label="Sill (m)"
            value={o.sill}
            min={0}
            onChange={(v) => a.updateOpening(o.id, { sill: Math.max(0, v) }, levelId)}
          />
          <Num
            label="Head (m)"
            value={o.head}
            min={0.1}
            onChange={(v) => a.updateOpening(o.id, { head: Math.max(0.1, v) }, levelId)}
          />
          {o.kind === 'door' && (
            <>
              <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
                <span className="label">Hinge</span>
                <div className="seg" style={{ marginLeft: 'auto' }}>
                  {(['start', 'end'] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`capitalize${doorHinge(o) === h ? ' on' : ''}`}
                      onClick={() => a.updateOpening(o.id, { hinge: h }, levelId)}
                      title={`Pivot the door on the ${h} jamb of the opening`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
                <span className="label">Swing</span>
                <div className="seg" style={{ marginLeft: 'auto' }}>
                  {(['left', 'right'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`capitalize${doorSwing(o) === s ? ' on' : ''}`}
                      onClick={() => a.updateOpening(o.id, { swing: s }, levelId)}
                      title={`Swing the leaf to the wall's ${s}-hand side`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <DeleteBtn onClick={() => a.removeOpening(o.id, levelId)} label={`Delete ${o.kind}`} />
        </div>
      )
    }
  } else if (sel?.type === 'note') {
    const note = (plan.notes ?? []).find((x) => x.id === sel.id)
    if (note) {
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span>Note</span>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <span className="label" style={{ whiteSpace: 'nowrap' }}>
              Text
            </span>
            <input
              type="text"
              value={note.text}
              aria-label="Note text"
              onChange={(e) => a.updateNote(note.id, { text: e.target.value })}
              className="input"
            />
          </label>
          <DeleteBtn onClick={() => a.removeNote(note.id)} label="Delete note" />
        </div>
      )
    }
  } else if (sel?.type === 'dim') {
    const dim = (plan.dimensions ?? []).find((x) => x.id === sel.id)
    if (dim) {
      const len = Math.hypot(dim.b[0] - dim.a[0], dim.b[1] - dim.a[1])
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span>Dimension</span>
          </div>
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">Length</span>
            <span className="amt" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
              {formatLength(len, units)}
            </span>
          </div>
          <DeleteBtn onClick={() => a.removeDimension(dim.id)} label="Delete dimension" />
        </div>
      )
    }
  } else if (sel?.type === 'polyline') {
    const poly = (plan.polylines ?? []).find((x) => x.id === sel.id)
    if (poly) {
      const len = polylineLength(poly.points, poly.closed)
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span>Polyline</span>
          </div>
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">{poly.closed ? 'Perimeter' : 'Length'}</span>
            <span className="amt" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
              {formatLength(len, units)}
            </span>
          </div>
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">Points</span>
            <span className="amt">{poly.points.length}</span>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!poly.closed}
              aria-label="Closed loop"
              onChange={(e) => a.updatePolyline(poly.id, { closed: e.target.checked || undefined })}
            />
            <span className="label">Closed loop</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!poly.dashed}
              aria-label="Dashed stroke"
              onChange={(e) => a.updatePolyline(poly.id, { dashed: e.target.checked || undefined })}
            />
            <span className="label">Dashed</span>
          </label>
          {!poly.closed && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!poly.arrow}
                aria-label="End arrow"
                onChange={(e) =>
                  a.updatePolyline(poly.id, { arrow: e.target.checked || undefined })
                }
              />
              <span className="label">End arrow</span>
            </label>
          )}
          <DeleteBtn onClick={() => a.removePolyline(poly.id)} label="Delete polyline" />
        </div>
      )
    }
  }

  return (
    <aside
      className="plan-props w-64 shrink-0 overflow-y-auto p-3"
      style={{
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface-solid)',
        // Desktop: a static right-hand column. Mobile: leave position to the
        // responsive CSS (a bottom sheet) so the canvas gets the full width.
        position: isMobile ? undefined : 'static',
      }}
    >
      <div className="sec-h" style={{ marginBottom: 'var(--s-3)' }}>
        <span>Properties</span>
      </div>
      {body}
    </aside>
  )
}

function DeleteBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-danger btn-block"
      style={{ marginTop: 'var(--s-1)' }}
    >
      {label}
    </button>
  )
}
