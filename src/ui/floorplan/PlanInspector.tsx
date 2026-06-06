import { planRoomArea, wallLength } from '../../floorplan/types'
import { BUILTIN_MATERIALS_BY_CATEGORY } from '../../materials/builtinCatalog'
import { useStore } from '../../state/store'
import { useIsMobile } from '../useIsMobile'

const FLOOR_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.floor ?? []

/** Numeric field with a label, editing one metre value. */
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
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="label">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="input mono"
        style={{ width: 96, textAlign: 'right' }}
      />
    </label>
  )
}

/** Right-hand inspector for the selected floor-plan element. */
export function PlanInspector() {
  const sel = useStore((s) => s.planSelection)
  const plan = useStore((s) => s.floorPlan)
  const a = useStore.getState()
  const isMobile = useIsMobile()

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
    const r = plan.rooms.find((x) => x.id === sel.id)
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
              onChange={(e) => a.updateRoom(r.id, { floor: e.target.value })}
              className="input"
            >
              {FLOOR_MATERIALS.map((m) => (
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
                Match home ({plan.ceilingHeight.toFixed(2)} m)
              </button>
            )}
          </div>
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
              {planRoomArea(r).toFixed(2)} m²
            </span>
          </div>
          <DeleteBtn onClick={() => a.removeRoom(r.id)} label="Delete room" />
        </div>
      )
  } else if (sel?.type === 'wall') {
    const w = plan.walls.find((x) => x.id === sel.id)
    if (w)
      body = (
        <div className="space-y-2">
          <div className="seg accent" style={{ display: 'flex' }}>
            {(['external', 'internal'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => a.updateWall(w.id, { thickness: t })}
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
            onChange={(v) => a.updateWall(w.id, { start: [v, w.start[1]] })}
          />
          <Num
            label="Start Z"
            value={w.start[1]}
            onChange={(v) => a.updateWall(w.id, { start: [w.start[0], v] })}
          />
          <Num
            label="End X"
            value={w.end[0]}
            onChange={(v) => a.updateWall(w.id, { end: [v, w.end[1]] })}
          />
          <Num
            label="End Z"
            value={w.end[1]}
            onChange={(v) => a.updateWall(w.id, { end: [w.end[0], v] })}
          />
          <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
            <span className="label">Length</span>
            <span className="amt" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
              {wallLength(w).toFixed(2)} m
            </span>
          </div>
          <DeleteBtn onClick={() => a.removeWall(w.id)} label="Delete wall" />
        </div>
      )
  } else if (sel?.type === 'opening') {
    const o = plan.openings.find((x) => x.id === sel.id)
    if (o) {
      const wall = plan.walls.find((x) => x.id === o.wallId)
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
            onChange={(v) => a.updateOpening(o.id, { offset: Math.max(0, Math.min(maxOff, v)) })}
          />
          <Num
            label="Width (m)"
            value={o.width}
            min={0.1}
            onChange={(v) => a.updateOpening(o.id, { width: Math.max(0.1, v) })}
          />
          <Num
            label="Sill (m)"
            value={o.sill}
            min={0}
            onChange={(v) => a.updateOpening(o.id, { sill: Math.max(0, v) })}
          />
          <Num
            label="Head (m)"
            value={o.head}
            min={0.1}
            onChange={(v) => a.updateOpening(o.id, { head: Math.max(0.1, v) })}
          />
          <DeleteBtn onClick={() => a.removeOpening(o.id)} label={`Delete ${o.kind}`} />
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
