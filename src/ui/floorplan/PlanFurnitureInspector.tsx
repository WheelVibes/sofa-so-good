import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { roomAtItem } from '../../floorplan/levels'
import { useCatalog } from '../../furniture/catalog'
import { resolveFootprintDims } from '../../furniture/footprintDims'
import type { FurnitureDef, FurnitureItem, ParamField } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { Icon } from '../toolbar/icons'
import { Num } from './PlanInspector'

/** Resolve the live width/depth (metres) of an item from its def + props.
 *  Mirrors the 3D inspector's footprint read: parametric items may override
 *  the default footprint via their `footprintParams` → paramSchema values. */
function itemFootprintWD(item: FurnitureItem, def: FurnitureDef): { w: number; d: number } {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const dims = resolveFootprintDims(def, item.props, { w, d })
    w = dims.w
    d = dims.d
  }
  return { w, d }
}

/** Find the editable paramSchema number field that drives a footprint axis
 *  (so the inspector can offer a clamped W/D editor for resizable defs). */
function footprintField(
  def: FurnitureDef,
  axis: 'w' | 'd',
): (ParamField & { kind: 'number' }) | null {
  if (def.kind !== 'parametric') return null
  const key = def.footprintParams?.[axis] ?? (axis === 'w' ? 'width' : 'depth')
  const field = def.paramSchema.find((f) => f.key === key)
  return field && field.kind === 'number' ? field : null
}

/**
 * Furniture branch of the 2D plan inspector (PARITY-PLAN-FURN-INSPECT). Mirrors
 * Sweet Home 3D / Coohom's "modify furniture" dialog: rename, numeric X/Z, angle
 * and (for parametric/resizable defs) width/depth, plus lock + delete. Edits
 * route through the SAME `itemsSlice` actions the 3D inspector uses — moves and
 * rotations are collision-checked via `canPlace` and push one undo step; resize
 * goes through `updateItemProps` (coalesced, so one drag = one undo step).
 *
 * Rendered by `PlanInspector` when the plan selection resolves to a placed item
 * (`selectedItemId`). Available in BOTH Simple and Pro — plan editing is a core
 * loop, not a pro surface, so it rides only the `floorPlanEditor` flag the editor
 * already gates on (no extra flag).
 */
export function PlanFurnitureInspector({
  item,
  levelId,
}: {
  item: FurnitureItem
  levelId?: string
}) {
  const catalog = useCatalog()
  const units = useStore((s) => s.units)
  const renameItem = useStore((s) => s.renameItem)
  const def = catalog[item.defId]
  if (!def) return null

  const { w, d } = itemFootprintWD(item, def)
  // Effective height: a per-item `props.height` (e.g. a window-bound curtain sized
  // floor-to-ceiling at placement, ~2.55 m) overrides the def's authored footprint
  // H (~2.75 m) — so the Size readout reports the real height, not the default.
  const propH = item.props['height']
  const h = typeof propH === 'number' ? propH : def.defaultFootprint.h

  // Collision-checked transform commit (one undo step), reading fresh state so a
  // stale captured `item` can't write a deleted id. Mirrors InspectorPanel.
  const tryMove = (x: number, z: number) => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked || Number.isNaN(x) || Number.isNaN(z)) return
    if (
      canPlace({ ...it, position: [x, z] }, def, {
        others: st.items,
        defs: catalog,
        doors: st.doors,
        walls: placementWalls(st, levelId),
      })
    ) {
      st.pushHistory()
      st.moveItem(it.id, [x, z])
    }
  }
  const trySetRotDeg = (deg: number) => {
    const st = useStore.getState()
    const it = st.items.find((i) => i.id === item.id)
    if (!it || it.locked || Number.isNaN(deg)) return
    const rot = (deg * Math.PI) / 180
    if (
      canPlace({ ...it, rotation: rot }, def, {
        others: st.items,
        defs: catalog,
        doors: st.doors,
        walls: placementWalls(st, levelId),
      })
    ) {
      st.pushHistory()
      st.rotateItem(it.id, rot)
    }
  }
  // Resize a footprint axis on a parametric def. `updateItemProps` coalesces per
  // (item, key) so repeated commits collapse into a single undo step.
  const setSizeProp = (field: ParamField & { kind: 'number' }, value: number) => {
    if (item.locked || Number.isNaN(value)) return
    const clamped = Math.max(field.min, Math.min(field.max, value))
    useStore.getState().updateItemProps(item.id, { [field.key]: clamped })
  }

  const wField = footprintField(def, 'w')
  const dField = footprintField(def, 'd')
  const rotDeg = Math.round(((item.rotation * 180) / Math.PI) * 10) / 10

  return (
    <div className="space-y-2">
      <div className="sec-h">
        <span className="capitalize">{def.category}</span>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="label" style={{ whiteSpace: 'nowrap' }}>
          Name
        </span>
        <input
          type="text"
          value={item.label ?? ''}
          placeholder={def.name}
          aria-label="Custom item name"
          onChange={(e) => renameItem(item.id, e.target.value)}
          className="input"
          style={{ flex: 1, minWidth: 0 }}
        />
      </label>

      <div className="action-grid two">
        <ActBtn
          label={item.locked ? 'Locked' : 'Lock'}
          icon={
            item.locked ? (
              <Icon.Lock width={16} height={16} />
            ) : (
              <Icon.Unlock width={16} height={16} />
            )
          }
          on={item.locked}
          title={item.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
          onClick={() => useStore.getState().toggleLock(item.id)}
        />
        <ActBtn
          label="Delete"
          icon={<Icon.Trash width={16} height={16} />}
          danger
          disabled={item.locked}
          title={item.locked ? 'Unlock first to delete' : 'Delete this item'}
          onClick={() => useStore.getState().deleteItem(item.id)}
        />
      </div>

      {/* Position + angle are hidden for window-bound fixtures (curtains/blinds):
          they're statically snapped to their window, so editing X/Z/angle would
          detach them. Mirrors the 3D inspector's `!def.windowBound` Transform gate
          (`InspectorPanel.tsx`) + the blocked scene/plan drag. Size fields below
          stay editable (a curtain still resizes), matching the 3D inspector. */}
      {!(def.windowBound || def.doorBound) ? (
        <>
          <Num
            label="X (m)"
            value={item.position[0]}
            step={0.05}
            onChange={(v) => tryMove(v, item.position[1])}
          />
          <Num
            label="Z (m)"
            value={item.position[1]}
            step={0.05}
            onChange={(v) => tryMove(item.position[0], v)}
          />
          <Num label="Angle (°)" value={rotDeg} step={15} onChange={trySetRotDeg} />
        </>
      ) : (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Fixed to its window — it stays snapped in place, so it can't be moved or rotated here.
        </p>
      )}

      {wField ? (
        <Num
          label="Width (m)"
          value={w}
          step={wField.step}
          min={wField.min}
          onChange={(v) => setSizeProp(wField, v)}
        />
      ) : null}
      {dField ? (
        <Num
          label="Depth (m)"
          value={d}
          step={dField.step}
          min={dField.min}
          onChange={(v) => setSizeProp(dField, v)}
        />
      ) : null}

      {/* Footprint readout — always shown so a fixed-size (GLB / non-resizable)
          piece still reports its dimensions, matching the 3D inspector header. */}
      <div className="row" style={{ padding: '6px 0', fontSize: 'var(--t-xs)' }}>
        <span className="label">Size (W×D×H)</span>
        <span className="amt mono" style={{ color: 'var(--accent-soft-text)', fontWeight: 700 }}>
          {formatDimsShort([w, d, h], units)}
        </span>
      </div>

      <button
        type="button"
        className="btn btn-accent btn-block"
        title="Close the plan editor and edit this piece in the 3D per-room editor"
        onClick={() => {
          const st = useStore.getState()
          // `roomAtItem` (F13): the item's OWN storey, and the shared
          // containment test. This hand-rolled rect check also ignored a
          // polygon room's real outline, so "edit in 3D" on an upstairs piece
          // either opened the room beneath it or nothing at all.
          const room = roomAtItem(st.floorPlan, item)
          st.setFloorPlanEditing(false)
          if (room) st.enterRoomEditor(room.id)
        }}
      >
        Edit in 3D
      </button>

      {item.locked ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Locked — unlock to move, rotate, resize or delete.
        </p>
      ) : null}
    </div>
  )
}

/** Local copy of the inspector action-grid cell (kept tiny + private so this
 *  module doesn't depend on PlanInspector internals beyond the `Num` field). */
function ActBtn({
  label,
  icon,
  onClick,
  on,
  danger,
  disabled,
  title,
}: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  on?: boolean
  danger?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`act${on ? ' on' : ''}${danger ? ' danger' : ''}`}
      onClick={() => !disabled && onClick()}
      disabled={disabled}
      title={title}
    >
      {icon}
      {label}
    </button>
  )
}
