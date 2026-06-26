import { useState } from 'react'
import type { RoomId } from '../../apartment/types'
import { useFeature } from '../../features/useFeature'
import { doorHinge, doorSwing } from '../../floorplan/doorSwing'
import { levelById, levelOfItem } from '../../floorplan/levels'
import { defaultOpeningName, defaultWallName } from '../../floorplan/planElementName'
import { polylineLength } from '../../floorplan/polyline'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../../floorplan/roomFinishes'
import {
  type CeilingConfig,
  type CeilingStyle,
  DEFAULT_PLAN_WALL_COLOR,
  planRoomArea,
  wallLength,
} from '../../floorplan/types'
import { endForAngle, endForLength, wallAngleDeg } from '../../floorplan/wallOps'
import { BUILTIN_MATERIALS_BY_CATEGORY } from '../../materials/builtinCatalog'
import { useStore } from '../../state/store'
import { formatArea, formatLength } from '../../utils/measurement'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { PlanFurnitureInspector } from './PlanFurnitureInspector'

const FLOOR_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.floor ?? []
const WALL_MATERIALS = BUILTIN_MATERIALS_BY_CATEGORY.wall ?? []

/** Minimize state for the plan inspector. Starts minimized whenever an element
 *  is selected (so the property sheet doesn't cover the plan, especially on
 *  mobile) — a new selection re-minimizes; the resting (no-selection) defaults
 *  view stays expanded. The user can toggle at any time. */
function usePlanInspectorMinimize(
  selKey: string,
  hasSelection: boolean,
): {
  minimized: boolean
  toggle: () => void
} {
  const [state, setState] = useState({ key: selKey, manual: hasSelection })
  if (state.key !== selKey) setState({ key: selKey, manual: hasSelection })
  return {
    minimized: state.manual,
    toggle: () => setState((v) => ({ ...v, manual: !v.manual })),
  }
}

/** Numeric field with a label, editing one metre value. Holds the raw text while
 *  focused so the user can clear / type a partial value ("1.", "-") freely, and
 *  only commits a *finite* number — so a blank/NaN field never reaches the plan
 *  geometry (which would make a degenerate room/wall and break save/render). */
export function Num({
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
  { id: 'sloped', label: 'Sloped' },
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
      {style === 'sloped' ? (
        <>
          <Num
            label="Fall / rise (m)"
            value={config?.slope?.rise ?? 0.4}
            step={0.05}
            min={0.05}
            onChange={(v) =>
              set({
                slope: { axis: config?.slope?.axis ?? 'x', rise: Math.max(0.05, Math.min(1.5, v)) },
              })
            }
          />
          <div className="seg" style={{ marginTop: 'var(--s-1)' }}>
            {(['x', 'z'] as const).map((ax) => (
              <button
                key={ax}
                type="button"
                className={`seg-btn${(config?.slope?.axis ?? 'x') === ax ? ' on' : ''}`}
                onClick={() => set({ slope: { axis: ax, rise: config?.slope?.rise ?? 0.4 } })}
              >
                {ax === 'x' ? 'Falls along X' : 'Falls along Z'}
              </button>
            ))}
          </div>
        </>
      ) : style !== 'flat' ? (
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
  const selectedWallIds = useStore((s) => s.selectedWallIds)
  // A placed furniture item selected on the plan (PARITY-PLAN-FURN-INSPECT).
  // Mutually exclusive with a plan-element selection: `selectItem` clears
  // `planSelection` and vice versa, so this is set only when an item is the
  // active selection. Filtered to the active storey so a stale/cross-level id
  // never resolves the wrong panel.
  const furnItem = useStore((s) =>
    s.selectedItemId ? (s.items.find((i) => i.id === s.selectedItemId) ?? null) : null,
  )
  const plan = useStore((s) => s.floorPlan)
  // The persisted `finishes` map is the source of truth for a room's floor/wall
  // pick — it round-trips through `serialize()` for EVERY plan, whereas the
  // plan's own `room.floor`/`room.wall` is dropped on the seeded default plan
  // (`isDefaultPlan` → no `floorPlan` in the save), so reading `room.floor`
  // directly desyncs the picker after a reload on the default flat (FIN-DEFAULT-FORK).
  const finishes = useStore((s) => s.finishes)
  const units = useStore((s) => s.units)
  const a = useStore.getState()
  const isMobile = useIsMobile()
  const ceilingDesignOn = useFeature('ceilingDesign')
  const slopingWallsOn = useFeature('slopingWalls')
  const wallBaseboardOn = useFeature('wallBaseboard')
  const wallThicknessOn = useFeature('wallThickness')
  const floorTextureOn = useFeature('floorTexture')
  // The active storey's geometry — selection ids come from the editor canvas,
  // which only ever shows (so only ever selects) active-level elements.
  const level = levelById(plan, levelId)

  // Full wall multi-selection (primary ∪ extras), filtered to existing walls.
  const wallSelIds = [
    ...new Set([...(sel?.type === 'wall' ? [sel.id] : []), ...selectedWallIds]),
  ].filter((id) => level.walls.some((w) => w.id === id))
  const isMulti = wallSelIds.length > 1

  // A placed item is the active selection only when it exists AND sits on the
  // storey the editor is showing (cross-level ids resolve no panel — graceful).
  const planItem =
    furnItem && levelOfItem(plan, furnItem).id === level.id && !isMulti && !sel ? furnItem : null

  const selKey = planItem
    ? `furn:${planItem.id}`
    : isMulti
      ? `multi:${wallSelIds.length}`
      : sel
        ? `${sel.type}:${sel.id}`
        : 'none'
  // A multi-selection is an action panel — keep it expanded (don't auto-minimize).
  const { minimized, toggle } = usePlanInspectorMinimize(selKey, (!!sel || !!planItem) && !isMulti)

  // On mobile the resting (no-selection) view only repeats the plan defaults,
  // which now live in the toolbar's Tools modal — so the panel is shown only
  // when an element (or placed item) is selected (to edit it). Desktop keeps
  // the defaults panel.
  if (isMobile && !sel && !planItem) return null

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
      {wallThicknessOn ? (
        <div className="flex flex-col gap-2">
          <span className="label">Wall thickness</span>
          <Num
            label="Exterior (m)"
            value={plan.wallThickness?.external ?? 0.2}
            step={0.01}
            min={0.05}
            onChange={(v) => {
              if (!Number.isFinite(v)) return
              a.updateFloorPlanMeta({
                wallThickness: { ...plan.wallThickness, external: Math.min(1, Math.max(0.05, v)) },
              })
            }}
          />
          <Num
            label="Interior (m)"
            value={plan.wallThickness?.internal ?? 0.1}
            step={0.01}
            min={0.05}
            onChange={(v) => {
              if (!Number.isFinite(v)) return
              a.updateFloorPlanMeta({
                wallThickness: { ...plan.wallThickness, internal: Math.min(1, Math.max(0.05, v)) },
              })
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            Plan-wide defaults; a selected wall can override its own thickness.
          </span>
        </div>
      ) : null}
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

  if (planItem) {
    // A placed furniture item is selected on the plan — show its property sheet
    // (rename / X·Z / angle / size / lock / delete) in its own focused module.
    body = <PlanFurnitureInspector item={planItem} levelId={levelId} />
  } else if (isMulti) {
    const selWalls = level.walls.filter((w) => wallSelIds.includes(w.id))
    const allLocked = selWalls.every((w) => w.locked)
    const lockedCount = selWalls.filter((w) => w.locked).length
    body = (
      <div className="space-y-2">
        <div className="sec-h">
          <span>{wallSelIds.length} walls selected</span>
        </div>
        <div className="action-grid two">
          <ActBtn
            label={allLocked ? 'Unlock all' : 'Lock all'}
            icon={
              allLocked ? (
                <Icon.Unlock width={16} height={16} />
              ) : (
                <Icon.Lock width={16} height={16} />
              )
            }
            on={allLocked}
            title={allLocked ? 'Unlock every selected wall' : 'Lock every selected wall'}
            onClick={() => a.setWallsLocked(wallSelIds, !allLocked, levelId)}
          />
          <ActBtn
            label="Delete all"
            icon={<Icon.Trash width={16} height={16} />}
            danger
            title={
              lockedCount
                ? `Delete the ${wallSelIds.length - lockedCount} unlocked walls (locked ones are kept)`
                : 'Delete every selected wall'
            }
            onClick={() => a.removeWalls(wallSelIds, levelId)}
          />
        </div>
        <button
          type="button"
          className="btn btn-soft btn-block"
          onClick={() => a.setPlanSelection(null)}
        >
          Clear selection
        </button>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Tip: Shift-click (or the toolbar <b style={{ color: 'var(--text)' }}>Select+</b> toggle on
          touch) adds or removes walls. {lockedCount > 0 ? `${lockedCount} locked.` : null}
        </p>
      </div>
    )
  } else if (sel?.type === 'room') {
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
          <label className="flex flex-col gap-1 text-xs">
            <span className="label">Floor finish</span>
            <select
              value={resolvePlanRoomFloor(finishes, r)}
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
              value={resolvePlanRoomWall(finishes, r) ?? ''}
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
  } else if (sel?.type === 'wall') {
    const w = level.walls.find((x) => x.id === sel.id)
    if (w)
      body = (
        <div className="space-y-2">
          <NameField
            value={w.name}
            placeholder={defaultWallName(w)}
            // Editing the name makes it permanent (clears the auto-assigned flag)
            // so room/auto-room allocation never overwrites it again.
            onChange={(v) => a.updateWall(w.id, { name: v, nameAuto: undefined }, levelId)}
          />
          <div className="action-grid">
            <ActBtn
              label="Reverse"
              icon={<Icon.FlipH width={16} height={16} />}
              disabled={w.locked}
              title="Reverse this wall's direction (flips its sides / door-swing reference)"
              onClick={() => a.reverseWall(w.id, levelId)}
            />
            <ActBtn
              label="Split"
              icon={<Icon.FlipV width={16} height={16} />}
              disabled={w.locked}
              title="Split this wall into two segments at its midpoint"
              onClick={() => a.splitWall(w.id, 0.5, levelId)}
            />
            <ActBtn
              label="Join"
              icon={<Icon.Rotate width={16} height={16} />}
              disabled={w.locked}
              title="Merge with a collinear neighbouring wall (inverse of Split)"
              onClick={() => a.joinWall(w.id, levelId)}
            />
            <ActBtn
              label="Duplicate"
              icon={<Icon.Copy width={16} height={16} />}
              title="Make a copy of this wall"
              onClick={() => a.duplicateWall(w.id, levelId)}
            />
            <ActBtn
              label={w.locked ? 'Locked' : 'Lock'}
              icon={
                w.locked ? (
                  <Icon.Lock width={16} height={16} />
                ) : (
                  <Icon.Unlock width={16} height={16} />
                )
              }
              on={w.locked}
              title={w.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
              onClick={() => a.updateWall(w.id, { locked: !w.locked || undefined }, levelId)}
            />
            <ActBtn
              label="Delete"
              icon={<Icon.Trash width={16} height={16} />}
              danger
              disabled={w.locked}
              onClick={() => a.removeWall(w.id, levelId)}
            />
          </div>
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
          {wallThicknessOn ? (
            <div className="flex flex-col gap-1">
              <Num
                label="Thickness (m)"
                value={w.thicknessM ?? (w.thickness === 'external' ? 0.2 : 0.1)}
                step={0.01}
                min={0.05}
                onChange={(v) => {
                  if (!Number.isFinite(v)) return
                  a.updateWall(w.id, { thicknessM: Math.min(1, Math.max(0.05, v)) }, levelId)
                }}
              />
              {w.thicknessM != null ? (
                <button
                  type="button"
                  className="btn ghost btn-sm self-start"
                  onClick={() => a.updateWall(w.id, { thicknessM: undefined }, levelId)}
                >
                  Use plan default
                </button>
              ) : null}
            </div>
          ) : null}
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
          <Num
            label="Length (m)"
            value={wallLength(w)}
            min={0.01}
            onChange={(v) => a.updateWall(w.id, { end: endForLength(w, v) }, levelId)}
          />
          <Num
            label="Angle (°)"
            value={Math.round(wallAngleDeg(w) * 10) / 10}
            step={1}
            onChange={(v) => a.updateWall(w.id, { end: endForAngle(w, v) }, levelId)}
          />
          {slopingWallsOn ? (
            <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
              <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                Sloping top (shed / mono-pitch — no openings)
              </div>
              <Num
                label="Top height @ start (m)"
                value={w.topHeight ?? plan.ceilingHeight}
                min={0.3}
                onChange={(v) => a.updateWall(w.id, { topHeight: v }, levelId)}
              />
              <Num
                label="Top height @ end (m)"
                value={w.topHeightEnd ?? w.topHeight ?? plan.ceilingHeight}
                min={0.3}
                onChange={(v) => a.updateWall(w.id, { topHeightEnd: v }, levelId)}
              />
              {w.topHeightEnd !== undefined ? (
                <button
                  type="button"
                  className="btn btn-soft btn-sm btn-block"
                  onClick={() =>
                    a.updateWall(w.id, { topHeightEnd: undefined, topHeight: undefined }, levelId)
                  }
                >
                  Reset to flat top
                </button>
              ) : null}
            </div>
          ) : null}
          {wallBaseboardOn ? (
            <div className="space-y-1" style={{ marginTop: 'var(--s-1)' }}>
              <div className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
                Baseboard / skirting
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!w.baseboard?.hidden}
                  onChange={(e) =>
                    a.updateWall(
                      w.id,
                      { baseboard: { ...w.baseboard, hidden: !e.target.checked } },
                      levelId,
                    )
                  }
                />
                <span>Show baseboard</span>
              </label>
              {!w.baseboard?.hidden ? (
                <>
                  <Num
                    label="Height (m)"
                    value={w.baseboard?.height ?? 0.09}
                    step={0.01}
                    min={0.01}
                    onChange={(v) =>
                      a.updateWall(
                        w.id,
                        {
                          baseboard: {
                            ...w.baseboard,
                            height: Math.abs(v - 0.09) < 1e-4 ? undefined : Math.max(0.01, v),
                          },
                        },
                        levelId,
                      )
                    }
                  />
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span className="label">Colour</span>
                    <input
                      type="color"
                      value={w.baseboard?.color ?? '#eceae4'}
                      onChange={(e) =>
                        a.updateWall(
                          w.id,
                          { baseboard: { ...w.baseboard, color: e.target.value } },
                          levelId,
                        )
                      }
                    />
                  </label>
                </>
              ) : null}
              {w.baseboard ? (
                <button
                  type="button"
                  className="btn btn-soft btn-sm btn-block"
                  onClick={() => a.updateWall(w.id, { baseboard: undefined }, levelId)}
                >
                  Reset baseboard
                </button>
              ) : null}
            </div>
          ) : null}
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
          <NameField
            value={o.name}
            placeholder={defaultOpeningName(o)}
            // Editing the name makes it permanent (clears the auto-assigned flag)
            // so a later room rename never overwrites it again.
            onChange={(v) => a.updateOpening(o.id, { name: v, nameAuto: undefined }, levelId)}
          />
          <div className={`action-grid${o.kind === 'door' ? '' : ' two'}`}>
            {o.kind === 'door' ? (
              <>
                <ActBtn
                  label="Flip hinge"
                  icon={<Icon.FlipH width={16} height={16} />}
                  disabled={o.locked}
                  title="Pivot on the opposite jamb"
                  onClick={() =>
                    a.updateOpening(
                      o.id,
                      { hinge: doorHinge(o) === 'start' ? 'end' : 'start' },
                      levelId,
                    )
                  }
                />
                <ActBtn
                  label="Flip swing"
                  icon={<Icon.FlipV width={16} height={16} />}
                  disabled={o.locked}
                  title="Swing the leaf to the wall's other side"
                  onClick={() =>
                    a.updateOpening(
                      o.id,
                      { swing: doorSwing(o) === 'left' ? 'right' : 'left' },
                      levelId,
                    )
                  }
                />
              </>
            ) : null}
            <ActBtn
              label="Duplicate"
              icon={<Icon.Copy width={16} height={16} />}
              title={`Make a copy of this ${o.kind}`}
              onClick={() => a.duplicateOpening(o.id, levelId)}
            />
            <ActBtn
              label={o.locked ? 'Locked' : 'Lock'}
              icon={
                o.locked ? (
                  <Icon.Lock width={16} height={16} />
                ) : (
                  <Icon.Unlock width={16} height={16} />
                )
              }
              on={o.locked}
              title={o.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
              onClick={() => a.updateOpening(o.id, { locked: !o.locked || undefined }, levelId)}
            />
            <ActBtn
              label="Delete"
              icon={<Icon.Trash width={16} height={16} />}
              danger
              disabled={o.locked}
              onClick={() => a.removeOpening(o.id, levelId)}
            />
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

  // Quick lock + delete for the selected wall / door / window, surfaced in the
  // header so they're reachable WITHOUT expanding the panel (the inspector
  // starts minimized on selection). `null` for other selections / multi-select.
  const quick = (() => {
    if (isMulti) return null
    if (planItem) {
      return {
        kind: 'item' as const,
        locked: !!planItem.locked,
        onLock: () => useStore.getState().toggleLock(planItem.id),
        onDelete: () => useStore.getState().deleteItem(planItem.id),
      }
    }
    if (sel?.type === 'wall') {
      const w = level.walls.find((x) => x.id === sel.id)
      if (!w) return null
      return {
        kind: 'wall' as const,
        locked: !!w.locked,
        onLock: () => a.updateWall(w.id, { locked: !w.locked || undefined }, levelId),
        onDelete: () => a.removeWall(w.id, levelId),
      }
    }
    if (sel?.type === 'opening') {
      const o = level.openings.find((x) => x.id === sel.id)
      if (!o) return null
      return {
        kind: o.kind,
        locked: !!o.locked,
        onLock: () => a.updateOpening(o.id, { locked: !o.locked || undefined }, levelId),
        onDelete: () => a.removeOpening(o.id, levelId),
      }
    }
    return null
  })()

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
      <div
        className="sec-h"
        style={{
          marginBottom: minimized ? 0 : 'var(--s-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* Tapping the title bar toggles the panel (expand when minimized,
            minimize when open) — everywhere except the explicit icon buttons,
            which stop propagation. The big button fills the bar so the whole
            title row is the tap target (touch-friendly). */}
        <button
          type="button"
          onClick={toggle}
          className="plan-props-title"
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            color: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            cursor: 'pointer',
          }}
          aria-label={minimized ? 'Expand properties' : 'Minimize properties'}
          aria-expanded={!minimized}
          title={minimized ? 'Expand' : 'Minimize'}
        >
          Properties
        </button>
        {/* Quick lock + delete for a selected wall/door/window while minimized,
            so they don't need the panel expanded. */}
        {minimized && quick ? (
          <>
            <button
              type="button"
              className={`icon-btn${quick.locked ? ' on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                quick.onLock()
              }}
              aria-pressed={quick.locked}
              aria-label={quick.locked ? `Unlock ${quick.kind}` : `Lock ${quick.kind}`}
              title={quick.locked ? 'Unlock — allow moving/editing' : 'Lock in place'}
            >
              {quick.locked ? (
                <Icon.Lock width={16} height={16} />
              ) : (
                <Icon.Unlock width={16} height={16} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={quick.locked}
              onClick={(e) => {
                e.stopPropagation()
                if (!quick.locked) quick.onDelete()
              }}
              aria-label={`Delete ${quick.kind}`}
              title={quick.locked ? 'Unlock first to delete' : `Delete ${quick.kind}`}
            >
              <Icon.Trash width={16} height={16} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          className="icon-btn"
          aria-label={minimized ? 'Expand properties' : 'Minimize properties'}
          title={minimized ? 'Expand' : 'Minimize'}
        >
          {minimized ? <Icon.Plus width={16} height={16} /> : <Icon.Minus width={16} height={16} />}
        </button>
      </div>
      {minimized ? null : body}
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

/** Custom-name field shared by the wall / door / window inspectors. Mirrors the
 *  furniture inspector: a placeholder shows the generated default, and clearing
 *  the field falls back to it (a blank name is stored as `undefined`). */
function NameField({
  value,
  placeholder,
  onChange,
}: {
  value?: string
  placeholder: string
  onChange: (v: string | undefined) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="label" style={{ whiteSpace: 'nowrap' }}>
        Name
      </span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        aria-label="Custom name"
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
        className="input"
        style={{ flex: 1, minWidth: 0 }}
      />
    </label>
  )
}

/** One cell of the inspector action grid (mirrors the furniture inspector's
 *  `.act` buttons): an icon over a label, with `on` / `danger` / `disabled`. */
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
