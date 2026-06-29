import { useFeature } from '../../../../features/useFeature'
import type { PlanRoom } from '../../../../floorplan/types'
import { planRoomArea } from '../../../../floorplan/types'
import { useStore } from '../../../../state/store'
import { formatArea, formatLength } from '../../../../utils/measurement'
import { Icon } from '../../../toolbar/icons'
import { ActBtn, CeilingControls, DeleteBtn, Num } from './shared'

/** Inspector body for a selected room. Reads edits/state from the store exactly
 *  as the inline dispatcher code did. */
export function RoomInspector({ room: r, levelId }: { room: PlanRoom; levelId?: string }) {
  const a = useStore.getState()
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const ceilingDesignOn = useFeature('ceilingDesign')
  const floorTextureOn = useFeature('floorTexture')
  const roomInsetOn = useFeature('roomInset')
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="label">Name</span>
        <input
          value={r.name}
          onChange={(e) => a.updateRoom(r.id, { name: e.target.value })}
          className="input"
        />
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          Drag the name on the plan to reposition it.
        </span>
      </label>
      {r.labelOffset ? (
        <button
          type="button"
          className="btn btn-soft btn-sm btn-block"
          onClick={() => a.updateRoom(r.id, { labelOffset: undefined })}
        >
          Reset label position
        </button>
      ) : null}
      <div className="space-y-1">
        <Num
          label="Label angle (°)"
          value={Math.round((((r.labelAngle ?? 0) * 180) / Math.PI) * 10) / 10}
          step={15}
          onChange={(v) => {
            const rad = (v * Math.PI) / 180
            a.updateRoom(r.id, { labelAngle: Math.abs(rad) < 1e-4 ? undefined : rad })
          }}
        />
        <Num
          label="Label size (×)"
          value={r.labelFontScale ?? 1}
          step={0.1}
          min={0.5}
          onChange={(v) =>
            a.updateRoom(r.id, {
              labelFontScale: Math.abs(v - 1) < 1e-3 ? undefined : Math.max(0.5, v),
            })
          }
        />
      </div>
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
      {/* Surface finishes (floor / wall / ceiling) are intentionally NOT
          offered in the floor plan editor — material choices belong to the
          per-room editor only, so the plan stays a structural/layout view.
          Only ceiling HEIGHT (geometry, not a finish) is editable here. */}
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
      {floorTextureOn ? (
        <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Floor texture
          </div>
          <Num
            label="Tile size (×)"
            value={r.floorTexScale ?? 1}
            step={0.1}
            min={0.25}
            onChange={(v) =>
              a.updateRoom(r.id, { floorTexScale: Math.abs(v - 1) < 1e-3 ? undefined : v })
            }
          />
          <Num
            label="Angle (°)"
            value={Math.round((((r.floorTexAngle ?? 0) * 180) / Math.PI) * 10) / 10}
            step={5}
            onChange={(v) => {
              const rad = (v * Math.PI) / 180
              a.updateRoom(r.id, { floorTexAngle: Math.abs(rad) < 1e-4 ? undefined : rad })
            }}
          />
        </div>
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
      {roomInsetOn ? (
        <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
          <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Inset / grow outline (offset every edge by 0.1 m)
          </div>
          <div className="action-grid two">
            <ActBtn
              label="Inset −0.1 m"
              icon={<Icon.Minus width={16} height={16} />}
              title="Shrink the room outline inward by 0.1 m (e.g. a dropped soffit)"
              onClick={() => a.insetRoom(r.id, 0.1)}
            />
            <ActBtn
              label="Grow +0.1 m"
              icon={<Icon.Plus width={16} height={16} />}
              title="Grow the room outline outward by 0.1 m (e.g. a setback)"
              onClick={() => a.insetRoom(r.id, -0.1)}
            />
          </div>
        </div>
      ) : null}
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
      <button
        type="button"
        className="btn btn-block"
        title="Make a copy of this room — its shape, finishes, and boundary walls, offset so it's visible"
        onClick={() => a.duplicateRoom(r.id, levelId)}
      >
        Duplicate room
      </button>
      <DeleteBtn onClick={() => a.removeRoom(r.id, levelId)} label="Delete room" />
    </div>
  )
}
