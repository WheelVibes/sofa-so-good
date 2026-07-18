import { useState } from 'react'
import { useFeature } from '../../features/useFeature'
import { GROUND_LEVEL_ID, levelById, levelOfItem } from '../../floorplan/levels'
import { electricalMountDefaultMm, plumbingMountDefaultMm } from '../../floorplan/mepPoints'
import { polylineLength } from '../../floorplan/polyline'
import {
  DEFAULT_PLAN_WALL_COLOR,
  type ElectricalKind,
  type PlumbingKind,
} from '../../floorplan/types'
import { useStore } from '../../state/store'
import { formatLength } from '../../utils/measurement'
import { ColorPicker } from '../controls/ColorPicker'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import { OpeningInspector } from './editor/inspector/OpeningInspector'
import { RoomInspector } from './editor/inspector/RoomInspector'
import { ActBtn, DeleteBtn, Num } from './editor/inspector/shared'
import { STRUCTURE_OPTIONS, WallInspector } from './editor/inspector/WallInspector'
import { ELECTRICAL_MEP_KINDS, PLUMBING_MEP_KINDS } from './editor/mepToolKinds'
import { PlanFurnitureInspector } from './PlanFurnitureInspector'
import { PlanMultiSelectActions } from './PlanMultiSelectActions'

// `Num` re-exported for callers that import it from this module (e.g.
// `PlanFurnitureInspector`) — its definition now lives in the shared module.
export { Num } from './editor/inspector/shared'

/** Minimize state for the plan inspector. On mobile it starts minimized whenever
 *  an element is selected (so the property sheet doesn't cover the plan) — a new
 *  selection re-minimizes; on desktop it opens expanded so wall/window/door
 *  properties are immediately visible. The resting (no-selection) defaults view
 *  stays expanded. The user can toggle at any time. */
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
  // Furniture multi-selection (PARITY-PLAN-ALIGN): when a marquee sweeps up 2+
  // placed pieces, `selectedItemIds` holds them all and `selectedItemId` mirrors
  // the last. We surface align/distribute/mirror actions instead of a single-item
  // sheet. Count only — the actions read fresh state via `useStore.getState()`.
  const furnSelCount = useStore((s) => s.selectedItemIds.length)
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const fMep = useFeature('mepEditor')
  const a = useStore.getState()
  const isMobile = useIsMobile()
  const wallThicknessOn = useFeature('wallThickness')
  const wallStructureOn = useFeature('wallStructure')
  // The active storey's geometry — selection ids come from the editor canvas,
  // which only ever shows (so only ever selects) active-level elements.
  const level = levelById(plan, levelId)

  // Full wall multi-selection (primary ∪ extras), filtered to existing walls.
  const wallSelIds = [
    ...new Set([...(sel?.type === 'wall' ? [sel.id] : []), ...selectedWallIds]),
  ].filter((id) => level.walls.some((w) => w.id === id))
  const isMulti = wallSelIds.length > 1
  // 2+ placed pieces selected (marquee) → the align/distribute/mirror panel.
  const isFurnMulti = furnSelCount > 1

  // A placed item is the active selection only when it exists AND sits on the
  // storey the editor is showing (cross-level ids resolve no panel — graceful).
  // A furniture multi-selection takes the bulk-action panel instead, so a single
  // item sheet must not also resolve off the mirrored primary `selectedItemId`.
  const planItem =
    furnItem && levelOfItem(plan, furnItem).id === level.id && !isMulti && !isFurnMulti && !sel
      ? furnItem
      : null

  const selKey = planItem
    ? `furn:${planItem.id}`
    : isFurnMulti
      ? `furnmulti:${furnSelCount}`
      : isMulti
        ? `multi:${wallSelIds.length}`
        : sel
          ? `${sel.type}:${sel.id}`
          : 'none'
  // A multi-selection is an action panel — keep it expanded (don't auto-minimize).
  // On DESKTOP the inspector opens expanded when an element is selected (so wall/
  // window/door properties are visible immediately); only on mobile does it start
  // minimized to avoid covering the plan.
  const { minimized, toggle } = usePlanInspectorMinimize(
    selKey,
    (!!sel || !!planItem) && !isMulti && !isFurnMulti && isMobile,
  )

  // On mobile the resting (no-selection) view only repeats the plan defaults,
  // which now live in the toolbar's Tools modal — so the panel is shown only
  // when an element (or placed item) is selected (to edit it). Desktop keeps
  // the defaults panel.
  if (isMobile && !sel && !planItem && !isFurnMulti) return null

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
          <ColorPicker
            ariaLabel="Wall colour"
            value={plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR}
            onChange={(hex) => a.updateFloorPlanMeta({ wallColor: hex })}
            paletteRoomId={null}
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
  } else if (isFurnMulti) {
    // 2+ placed pieces marquee-selected — align / distribute / mirror them in
    // place (PARITY-PLAN-ALIGN). Reuses the same pure ops as the 3D panel.
    body = <PlanMultiSelectActions levelId={levelId} />
  } else if (isMulti) {
    const selWalls = level.walls.filter((w) => wallSelIds.includes(w.id))
    const allLocked = selWalls.every((w) => w.locked)
    const lockedCount = selWalls.filter((w) => w.locked).length
    // Bulk structural classification (TODO G7) — shows the shared value when
    // every selected wall agrees, else a "Mixed" placeholder (no value forced).
    const structureValues = new Set(selWalls.map((w) => w.structure ?? 'unknown'))
    const commonStructure = structureValues.size === 1 ? [...structureValues][0] : undefined
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
        {wallStructureOn ? (
          <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
            <span className="label">Structure (all)</span>
            <Select
              className="input"
              style={{ marginLeft: 'auto', maxWidth: '56%' }}
              value={commonStructure ?? ''}
              placeholder="Mixed"
              onChange={(v) =>
                a.setWallsStructure(wallSelIds, v as (typeof STRUCTURE_OPTIONS)[number][0], levelId)
              }
              ariaLabel="Structure (all selected walls)"
              options={STRUCTURE_OPTIONS.map(([value, label]) => ({ value, label }))}
            />
          </div>
        ) : null}
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
    if (r) body = <RoomInspector room={r} levelId={levelId} />
  } else if (sel?.type === 'wall') {
    const w = level.walls.find((x) => x.id === sel.id)
    if (w) body = <WallInspector wall={w} levelId={levelId} />
  } else if (sel?.type === 'opening') {
    const o = level.openings.find((x) => x.id === sel.id)
    if (o) body = <OpeningInspector opening={o} level={level} levelId={levelId} />
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
  } else if (sel?.type === 'mep' && fMep) {
    const { family } = sel
    // Level-scope the lookup like the room/wall/opening branches above — the
    // canvas MepLayer is level-filtered, so a stale cross-storey selection
    // must go blank here too, not silently edit/delete an off-screen point
    // on another storey (bug-hunt 2026-07-18 finding #1).
    const onLevel = (x: { levelId?: string }) =>
      (x.levelId ?? GROUND_LEVEL_ID) === (levelId ?? GROUND_LEVEL_ID)
    const elecPoint =
      family === 'electrical'
        ? (plan.electricalPoints ?? []).find((x) => x.id === sel.id && onLevel(x))
        : null
    const plumbPoint =
      family === 'plumbing'
        ? (plan.plumbingPoints ?? []).find((x) => x.id === sel.id && onLevel(x))
        : null
    const p = elecPoint ?? plumbPoint
    if (p) {
      const kindOptions = (family === 'electrical' ? ELECTRICAL_MEP_KINDS : PLUMBING_MEP_KINDS).map(
        (x) => ({ value: x.kind, label: x.title }),
      )
      const defaultMm =
        family === 'electrical'
          ? electricalMountDefaultMm(p.kind as ElectricalKind)
          : plumbingMountDefaultMm(p.kind as PlumbingKind)
      const setMountHeight = (mm: number) =>
        family === 'electrical'
          ? a.updateElectricalPoint(p.id, { mountHeightMm: mm })
          : a.updatePlumbingPoint(p.id, { mountHeightMm: mm })
      // Preset chips are electrical-only (skirting/switch/aircon/screen
      // heights the plan doc names) — plumbing mount heights are per-kind
      // fixed conventions (floor-level traps, 600mm water points) with no
      // equivalent "pick one of a few common heights" spread.
      const presets = family === 'electrical' ? [300, 1050, 1200, 2400] : []
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span>{family === 'electrical' ? 'Electrical point' : 'Plumbing point'}</span>
          </div>
          <div className="row" style={{ padding: '6px 0', alignItems: 'center' }}>
            <span className="label">Kind</span>
            <Select
              className="input"
              style={{ marginLeft: 'auto', maxWidth: '65%' }}
              value={p.kind}
              onChange={(v) =>
                family === 'electrical'
                  ? a.updateElectricalPoint(p.id, { kind: v as ElectricalKind })
                  : a.updatePlumbingPoint(p.id, { kind: v as PlumbingKind })
              }
              ariaLabel="MEP point kind"
              options={kindOptions}
            />
          </div>
          <Num
            label="Mount height (mm AFFL)"
            value={p.mountHeightMm}
            step={50}
            min={0}
            placeholder={String(defaultMm)}
            onChange={setMountHeight}
          />
          {presets.length > 0 && (
            <div className="quick-finish">
              <span className="quick-finish-h">Standard heights</span>
              {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> needs a
                  <legend> and adds default browser border/padding — role="group"
                  + aria-label is the non-visual equivalent (mirrors
                  MountHeightPresets). */}
              <div className="quick-finish-row" role="group" aria-label="Standard heights">
                {presets.map((mm) => {
                  const isActive = (p.mountHeightMm ?? defaultMm) === mm
                  return (
                    <button
                      key={mm}
                      type="button"
                      className={`chip${isActive ? ' on' : ''}`}
                      title={`Set mount height to ${mm}mm AFFL`}
                      aria-pressed={isActive}
                      onClick={() => setMountHeight(mm)}
                    >
                      {mm}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <span className="label" style={{ whiteSpace: 'nowrap' }}>
              Label
            </span>
            <input
              type="text"
              value={p.label ?? ''}
              aria-label="Point label"
              placeholder="e.g. fridge, WC"
              onChange={(e) =>
                family === 'electrical'
                  ? a.updateElectricalPoint(p.id, { label: e.target.value || undefined })
                  : a.updatePlumbingPoint(p.id, { label: e.target.value || undefined })
              }
              className="input"
            />
          </label>
          <DeleteBtn
            onClick={() =>
              family === 'electrical' ? a.removeElectricalPoint(p.id) : a.removePlumbingPoint(p.id)
            }
            label={family === 'electrical' ? 'Delete electrical point' : 'Delete plumbing point'}
          />
        </div>
      )
    }
  } else if (sel?.type === 'dim') {
    const dim = (plan.dimensions ?? []).find((x) => x.id === sel.id)
    if (dim) {
      const len = Math.hypot(dim.b[0] - dim.a[0], dim.b[1] - dim.a[1])
      // Editing the length moves endpoint B along the A→B direction (A fixed).
      const setLength = (next: number) => {
        if (!Number.isFinite(next) || next <= 0 || len < 1e-6) return
        const ux = (dim.b[0] - dim.a[0]) / len
        const uz = (dim.b[1] - dim.a[1]) / len
        a.updateDimension(dim.id, { b: [dim.a[0] + ux * next, dim.a[1] + uz * next] })
      }
      body = (
        <div className="space-y-2">
          <div className="sec-h">
            <span>Dimension</span>
          </div>
          <Num label="Length (m)" value={len} min={0.01} step={0.05} onChange={setLength} />
          <div className="sec-h" style={{ marginTop: 'var(--s-2)' }}>
            <span>Endpoints</span>
          </div>
          <Num
            label="A · X (m)"
            value={dim.a[0]}
            onChange={(v) => a.updateDimension(dim.id, { a: [v, dim.a[1]] })}
          />
          <Num
            label="A · Z (m)"
            value={dim.a[1]}
            onChange={(v) => a.updateDimension(dim.id, { a: [dim.a[0], v] })}
          />
          <Num
            label="B · X (m)"
            value={dim.b[0]}
            onChange={(v) => a.updateDimension(dim.id, { b: [v, dim.b[1]] })}
          />
          <Num
            label="B · Z (m)"
            value={dim.b[1]}
            onChange={(v) => a.updateDimension(dim.id, { b: [dim.b[0], v] })}
          />
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
