import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { exitPlanEditorToScene } from '../../controls/planEditorHotkey'
import { isEditableTarget } from '../../controls/useKeyboard'
import { useFeature } from '../../features/useFeature'
import { defaultDoorSwing } from '../../floorplan/doorSwing'
import { traceBuildingOutline } from '../../floorplan/footprint'
import { GROUND_LEVEL_ID, levelAsPlan, levelById, levelOfItem } from '../../floorplan/levels'
import { planIntegrityFlags } from '../../floorplan/planIntegrity'
import { roomLabelPoint } from '../../floorplan/roomCentroid'
import { detectRoomPolygon } from '../../floorplan/roomDetect'
import { isSlopedWall, slopedWallHeights } from '../../floorplan/slopedWall'
import { planBounds, planTotalArea, pointInRoom, wallLength } from '../../floorplan/types'
import { arcFromMidpoint, isCurvedWall, wallArcLength } from '../../floorplan/wallArc'
import { useCatalogGetter } from '../../furniture/catalog'
import { beginDrop } from '../../scene/placementDrop'
import { groupResizeFactor, resizedTransform } from '../../scene/selection/resizeGizmoMath'
import {
  computeRotation,
  pointerAngle,
  rotatePointAround,
} from '../../scene/selection/rotateGizmoMath'
import type { ContextTarget } from '../../state/slices/featuresSlice'
import { useStore } from '../../state/store'
import { safeImageSrc } from '../../utils/safeUrl'
import { SliderField } from '../controls/SliderField'
import { openDocs } from '../docsUrl'
import { InfoCallout } from '../InfoCallout'
import { evictPanoStop } from '../panorama/panoImageIdb'
import { useIsMobile } from '../useIsMobile'
import { centerBackdrop, rescaleBackdropAnchored } from './editor/backdropPlacement'
import { DrawToolPalette } from './editor/DrawToolPalette'
import { EditModeToggle } from './editor/EditModeToggle'
import { GridLines } from './editor/GridLines'
import { GridZoomControls } from './editor/GridZoomControls'
import { LevelMenu } from './editor/LevelMenu'
import { AnnotationsLayer } from './editor/layers/AnnotationsLayer'
import { DimensionsLayer } from './editor/layers/DimensionsLayer'
import { DraftOverlayLayer } from './editor/layers/DraftOverlayLayer'
import { FurnitureLayer } from './editor/layers/FurnitureLayer'
import { FurnitureRotateHandle } from './editor/layers/FurnitureRotateHandle'
import { NotesLayer } from './editor/layers/NotesLayer'
import { OpeningsLayer } from './editor/layers/OpeningsLayer'
import { OtherLevelsUnderlay } from './editor/layers/OtherLevelsUnderlay'
import { PersistentDimensionsLayer } from './editor/layers/PersistentDimensionsLayer'
import { PlacementGhostLayer } from './editor/layers/PlacementGhostLayer'
import { PlanGuidesLayer } from './editor/layers/PlanGuidesLayer'
import { PolylinesLayer } from './editor/layers/PolylinesLayer'
import { RoomsLayer } from './editor/layers/RoomsLayer'
import { TourStopsLayer } from './editor/layers/TourStopsLayer'
import { WallHandlesLayer } from './editor/layers/WallHandlesLayer'
import { WallsLayer } from './editor/layers/WallsLayer'
import { type MarqueeItem, type MarqueeRect, marqueeSelect } from './editor/marqueeSelect'
import { PlanDefaultsFields } from './editor/PlanDefaultsFields'
import { PlanEditorHeader } from './editor/PlanEditorHeader'
import { PlanLibrary } from './editor/PlanLibrary'
import { PlanMenu } from './editor/PlanMenu'
import { PlanToolsSheet } from './editor/PlanToolsSheet'
import { PlanTotalLabel } from './editor/PlanTotalLabel'
import { PlanViewMenuActions } from './editor/PlanViewMenuActions'
import { EXPORT_PAD, GRID_MARGIN, type Tool, ZOOM_BTN_STEP } from './editor/planConstants'
import {
  buildPlanGhostItem,
  decidePlanCommit,
  isPlanPlaceable,
  planGhostValid,
} from './editor/planFurnishPlacement'
import { dimFontPx, roomFontPx } from './editor/planLabelDisplay'
import { createPlanPointerMapping } from './editor/planPointerMapping'
import { chooseScaleBar } from './editor/scaleBar'
import { vertexDragTarget } from './editor/snapWallAngle'
import { clearsSelectionOnPanRelease } from './editor/tapDeselect'
import {
  dimensionCommit,
  polygonClick,
  rectFromVerts,
  roomCommit,
  rotateWallTransform,
  scaleCommits,
  wallCommit,
  wallTapCommits,
} from './editor/toolDraftReducer'
import { UndoRedoButtons } from './editor/UndoRedoButtons'
import { usePlanAiWalls } from './editor/usePlanAiWalls'
import { usePlanBackdrop } from './editor/usePlanBackdrop'
import { usePlanLevel } from './editor/usePlanLevel'
import { usePlanViewport } from './editor/usePlanViewport'
import { WallNumericEntry } from './editor/WallNumericEntry'
import { WallTypeToggle } from './editor/WallTypeToggle'
import { exportPlanPng } from './exportPlanPng'
import { PlanInspector } from './PlanInspector'
import { ScalePlanModal } from './ScalePlanModal'
import { TemplatePicker } from './TemplatePicker'

export function FloorPlanEditor() {
  const editing = useStore((s) => s.floorPlanEditing)
  const plan = useStore((s) => s.floorPlan)
  const gridSize = useStore((s) => s.gridSize)
  const setGridSize = useStore((s) => s.setGridSize)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const sel = useStore((s) => s.planSelection)
  const selectedWallIdsRaw = useStore((s) => s.selectedWallIds)
  const planWallMultiAdd = useStore((s) => s.planWallMultiAdd)
  const units = useStore((s) => s.units)
  const a = useStore.getState()

  const items = useStore((s) => s.items)
  const planLabels = useStore((s) => s.planLabels)
  const fPlanLabels = useFeature('planLabels')
  const labelsOn = fPlanLabels && planLabels !== 'off'
  // Price displays are gated behind the budget/price feature (off by default).
  const fPrice = useFeature('budget')
  const selectedItemId = useStore((s) => s.selectedItemId)
  // Multi-item plan selection (marquee / future shift-click). A Set for O(1)
  // membership while highlighting footprints.
  const selectedItemIdsRaw = useStore((s) => s.selectedItemIds)
  const selectedItemIds = useMemo(() => new Set(selectedItemIdsRaw), [selectedItemIdsRaw])
  const annotations = useStore((s) => s.annotations)
  const { getDef, ref: catalogRef } = useCatalogGetter()
  // Mobile: the toolbar is too cluttered to fit, so secondary controls + the
  // plan defaults collapse behind a single "Tools" menu (parity with the
  // per-room editor's collapsed mobile toolbar).
  const isMobile = useIsMobile()
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [scaleModalOpen, setScaleModalOpen] = useState(false)
  const fPlanScale = useFeature('planScale')
  const fPanoTour = useFeature('panoTour')
  const fCurvedWalls = useFeature('curvedWalls')
  const fCompass = useFeature('planCompass')
  const fGridSnap = useFeature('planGridSnap')
  const fGuides = useFeature('planGuides')
  const fDimChain = useFeature('dimensionChain')
  const fCornerFillet = useFeature('cornerFillet')
  const fTilt = useFeature('tiltFurniture')
  const orientationDeg = useStore((s) => s.orientationDeg)
  // PLAN-FURNISH Phase 1 — click-to-place furniture straight onto the plan.
  // Desktop only (mobile tap-to-place is a later phase); the catalog itself is
  // only surfaced here under the same condition (`CatalogDrawer`'s
  // `planFurnishActive`), so this just mirrors that gate for the pointer
  // dispatch + ghost render.
  const fPlanFurnish = useFeature('planFurnish') && !isMobile
  const activeDefId = useStore((s) => s.activeDefId)
  const ghostRotation = useStore((s) => s.ghostRotation)
  const catalogOpen = useStore((s) => s.catalogOpen)
  const doors = useStore((s) => s.doors)
  // Latest world point the armed ghost previewed at (set by `onMove`); the
  // ghost item + its `canPlace` validity are derived from it each render
  // rather than written into the shared 3D `ghostWorld`/`ghostValid` fields —
  // those stay untouched by the plan editor (PLAN-FURNISH risk #1: never wire
  // this into the canvas-bound 3D placement stack).
  const [planGhostWorld, setPlanGhostWorld] = useState<[number, number] | null>(null)
  // Tour stops are only shown/editable on the ground level (stops have a
  // levelId field but the plan editor operates per-level; ground is the
  // common case and keeps the UI simple).
  const panoTourStops = useStore((s) => s.panoTourStops)

  const [tool, setTool] = useState<Tool>('select')
  const [wallType, setWallType] = useState<'internal' | 'external'>('internal')
  // Active storey (F13/ML4b) + everything derived from it (the single-storey
  // `levelPlan` every tool/overlay/inspector edit targets) — see `usePlanLevel`.
  const { setActiveLevelId, levelPlan, levelId, isMultiLevel, otherLevels } = usePlanLevel(
    plan,
    editing,
  )
  // The full wall selection = primary wall (if any) ∪ the multi-select extras,
  // filtered to walls that still exist (so deletes/merges leave no stale ids).
  const selectedWalls = useMemo(() => {
    const ids = new Set<string>([...(sel?.type === 'wall' ? [sel.id] : []), ...selectedWallIdsRaw])
    const present = new Set(levelPlan.walls.map((w) => w.id))
    return new Set([...ids].filter((id) => present.has(id)))
  }, [sel, selectedWallIdsRaw, levelPlan.walls])
  // Exact wall-enclosed outline (exterior walls) for the un-roomed flag: drawn
  // beneath the room fills, so walled-in floor with no room shows through in red.
  const fUnroomed = useFeature('unroomedFlag')
  const unroomedOutline = useMemo(
    () =>
      fUnroomed
        ? traceBuildingOutline(
            levelPlan.walls
              .filter((w) => w.thickness === 'external')
              .map((w) => ({ start: w.start, end: w.end })),
          )
        : null,
    [fUnroomed, levelPlan.walls],
  )
  // Stray-element flags (Pro): walls joined to nothing, rooms touching no other
  // room, openings off any wall — drawn in red so the apartment can be made whole.
  const fIntegrity = useFeature('planIntegrity')
  const strays = useMemo(
    () =>
      fIntegrity
        ? planIntegrityFlags(levelPlan.walls, levelPlan.rooms, levelPlan.openings)
        : { walls: new Set<string>(), rooms: new Set<string>(), openings: new Set<string>() },
    [fIntegrity, levelPlan.walls, levelPlan.rooms, levelPlan.openings],
  )
  const strayCount = strays.walls.size + strays.rooms.size + strays.openings.size
  const [draft, setDraft] = useState<{ x0: number; z0: number; x: number; z: number } | null>(null)
  // Rubber-band marquee (PARITY-PLAN-MARQUEE): a drag on empty canvas with the
  // select tool draws this rect (plan coords, unsnapped so it tracks the
  // cursor); on pointer-up every furniture footprint / wall it intersects is
  // multi-selected. Null when no marquee is in progress.
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  // Numeric-entry preview: when the user types in the WallNumericEntry overlay,
  // this overrides the drag endpoint for the live preview. Cleared on each new
  // pointer-down (drag starts fresh) or commit/cancel.
  const [numericPreviewEnd, setNumericPreviewEnd] = useState<[number, number] | null>(null)
  // Active room drag (select tool): grab offset from the room origin.
  const [moving, setMoving] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active furniture drag (select tool): grab offset from the item position.
  const [movingItem, setMovingItem] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active wall-vertex drag (select tool): which wall endpoint is being moved.
  const [movingVertex, setMovingVertex] = useState<{ id: string; which: 'start' | 'end' } | null>(
    null,
  )
  // Active dimension-endpoint drag (select tool): which end ('a'/'b') is moving.
  const [movingDimEnd, setMovingDimEnd] = useState<{ id: string; which: 'a' | 'b' } | null>(null)
  // Active polygon-room vertex drag (select tool): which polygon point is moving.
  // Lets a free-form (polyroom) room be reshaped after creation.
  const [movingPolyVertex, setMovingPolyVertex] = useState<{ id: string; index: number } | null>(
    null,
  )
  // Active wall-curve bulge drag (select tool): drag a wall's midpoint to bow it
  // into a curve (PARITY-CURVEDWALL).
  const [movingBulge, setMovingBulge] = useState<{ id: string } | null>(null)
  // Active door/window drag ALONG its wall: `grab` = the along-wall distance
  // between the grab point and the opening's offset, so it doesn't jump on grab.
  const [movingOpening, setMovingOpening] = useState<{ id: string; grab: number } | null>(null)
  // Active whole-wall translate: original endpoints + grab point; connected walls
  // follow via moveWallTo so corners stay joined.
  const [movingWall, setMovingWall] = useState<{
    id: string
    s0: [number, number]
    e0: [number, number]
    grab: [number, number]
  } | null>(null)
  // Active wall rotate (handle): centre + original endpoints + the pointer angle
  // at grab, so rotation tracks the handle.
  const [rotatingWall, setRotatingWall] = useState<{
    id: string
    cx: number
    cz: number
    s0: [number, number]
    e0: [number, number]
    a0: number
  } | null>(null)
  // Active furniture rotate (handle): item centre + its rotation at grab + the
  // pointer angle at grab. The gesture tracks the handle relative to the grab
  // (picking up the ring never snaps the piece) — mirrors the 3D RotateGizmo.
  const [rotatingItem, setRotatingItem] = useState<{
    id: string
    cx: number
    cz: number
    startRot: number
    a0: number
  } | null>(null)
  // Active MULTI-select rotate (unified ring handle): the selection centroid +
  // the pointer angle at grab + every member's original position/rotation, so the
  // whole selection orbits its centroid rigidly (Canva parity).
  const [rotatingMulti, setRotatingMulti] = useState<{
    cx: number
    cz: number
    a0: number
    originals: { id: string; position: [number, number]; rotation: number }[]
  } | null>(null)
  // Active MULTI-select resize (corner handle): the fixed pivot (opposite corner
  // of the dragged handle, world coords) + the pivot→grab distance + every
  // member's original position/uniform-scale, so the whole selection scales as a
  // block about that corner (Canva parity).
  const [scalingMulti, setScalingMulti] = useState<{
    pivot: [number, number]
    grabDist: number
    originals: { id: string; position: [number, number]; scale: number }[]
  } | null>(null)
  // Active tour-stop drag: grab offset from the stop's world position.
  const [movingStop, setMovingStop] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active note drag (select tool): grab offset from the note's position.
  const [movingNote, setMovingNote] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active room-name-label drag (select tool): grab offset from the label's
  // current world position (PARITY-ROOMLABEL).
  const [movingRoomLabel, setMovingRoomLabel] = useState<{
    id: string
    gx: number
    gz: number
  } | null>(null)
  // In-progress polygon-room vertices (polyroom tool): click to add a vertex,
  // click near the first vertex (or Enter) to close into a room.
  const [polyDraft, setPolyDraft] = useState<[number, number][]>([])
  // In-progress polyline-annotation vertices (polyline tool): click to add a
  // vertex; Enter finishes as an open path, clicking the first vertex (≥3)
  // closes the loop, Escape cancels (PARITY-POLYLINE).
  const [polylineDraft, setPolylineDraft] = useState<[number, number][]>([])
  const fPolyline = useFeature('planPolyline')
  const fWallNumericEntry = useFeature('wallNumericEntry')
  const fMirrorRegion = useFeature('planMirrorRegion')
  // Ghost-stencil trace backdrop (button + drop target + underlay render).
  const fTraceBackdrop = useFeature('planTraceBackdrop')
  // Reference photo/scan to trace over (Wave F: photo-to-plan, no ML).
  // Persisted to IDB (blob + calibration) so it survives editor close + reload.
  const { backdrop, setBackdrop, loadBackdrop, removeBackdrop } = usePlanBackdrop(
    editing,
    setTool,
    plan,
  )
  const { aiBusy, runAiWalls } = usePlanAiWalls(backdrop)
  const aiWalls = useFeature('aiWalls')
  // Persistent wall-length labels (on by default; toggle in the editor header).
  // Dimensions default OFF — they're the densest overlay and collide with walls
  // when zoomed out; the toolbar "Dims" toggle turns them on. When on, callouts
  // are culled + font-scaled by zoom/screen so they stay legible (see below).
  const [showWallDims, setShowWallDims] = useState(false)
  // Room name + area/perimeter callouts. On by default, but the "Labels" View
  // toggle hides them (PARITY-PLANLABELS) — when off, no room name or dimensions
  // are drawn even for the selected room, so the plan can be read uncluttered.
  const [showRoomLabels, setShowRoomLabels] = useState(true)
  // View vs Edit interaction mode. **View** = pan/zoom + tap-to-inspect only, so
  // a one-finger drag never shifts anything (the default on touch, where stray
  // drags are easy). **Edit** enables drawing + moving; on touch an item must be
  // tapped (selected) before a drag moves it — otherwise the drag pans. Mouse
  // (desktop) edit keeps the direct drag-to-move behaviour.
  const [editMode, setEditMode] = useState<'view' | 'edit'>(isMobile ? 'view' : 'edit')
  // Furniture footprints are HIDDEN by default in the editor so they don't get in
  // the way of (or get accidentally grabbed while) editing walls/rooms. The
  // "Furniture" toggle shows them; while hidden they can't be selected or moved.
  const [showFurniture, setShowFurniture] = useState(false)
  // Show the OTHER storeys' walls as a dimmed underlay (SH3D "all levels"), so
  // you can stack walls / line up stairs between floors. Off by default.
  const [showOtherLevels, setShowOtherLevels] = useState(false)
  // "Skeleton" view: draw every wall at one uniform thin stroke (ignoring the
  // external/internal thickness), so it's obvious whether wall endpoints meet to
  // form a closed room — thick walls of different widths otherwise hide small
  // gaps / overlaps at corners. Openings stay drawn (they're part of the wall).
  const [skeleton, setSkeleton] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Viewport: fit scale, zoom (wheel/pinch/±, anchored), pannable scroll, and the
  // metre↔pixel scale — see `editor/usePlanViewport`. The pan/pinch gestures live
  // in this component's pointer dispatch, which reads the returned refs.
  const {
    svgRef,
    canvasRef,
    panRef,
    panDidMove,
    touchPts,
    pinch,
    zoomRef,
    ew,
    ed,
    zoom,
    PX,
    W,
    H,
    toPx,
    zoomToPoint,
    zoomAroundCentre,
    resetView,
  } = usePlanViewport(plan, levelPlan, editing)
  // Touch wall tap-to-place: whether an anchor (start point) already existed when
  // the current pointer went down, so onUp can tell "placing the start" from
  // "placing the end / ending the chain".
  const wallTapHadAnchor = useRef(false)
  // Set by an element's pointer-down (via `beginElementDrag`) so the bubbled
  // canvas `onDown` knows the press landed ON a selectable element and must NOT
  // start an empty-canvas marquee. Without this, a touch tap on an unselected
  // wall/room/opening/item (where `beginElementDrag` returns without stopping
  // propagation) bubbles to the marquee path, whose zero-area (tap) resolution
  // clears the selection the element just made — select→instant-deselect. Reset
  // each gesture in `onUp`.
  const elementTapped = useRef(false)

  // Last pointer position in plan metres — where a new ruler guide is dropped
  // (PARITY-PLAN-GUIDES). Updated on every pointer move over the canvas.
  const lastPlanPtRef = useRef<[number, number]>([0, 0])
  // Exiting back to 3D (Done button / Escape) frames the selected furniture via
  // the shared `exitPlanEditorToScene`. NOTE: the `P` open/close binding lives in
  // `controls/planEditorHotkey.ts` (always mounted via App) — this component is
  // lazy-mounted only while open, so a listener here could never OPEN it.

  const snap = (m: number) => (gridSize > 0 ? Math.round(m / gridSize) * gridSize : m)
  // Plan centre in screen px (dimension callouts orient away from it) + the
  // zoom/screen-scaled label fonts so overlays stay legible without dominating.
  const planCentrePx: [number, number] = [toPx(ew / 2), toPx(ed / 2)]
  const dimFont = dimFontPx(PX)
  const roomFont = roomFontPx(PX)

  /** Close an in-progress polygon into a room (bbox → origin/width/depth + the
   *  explicit polygon for area/render/containment) on the active storey. */
  const commitPolyRoom = useCallback(
    (verts: [number, number][]) => {
      if (verts.length < 3) return
      const { origin, width, depth } = rectFromVerts(verts)
      const st = useStore.getState()
      const n = levelById(st.floorPlan, levelId).rooms.length + 1
      const id = st.addRoom(
        {
          name: `Room ${n}`,
          origin,
          width,
          depth,
          polygon: verts,
        },
        levelId,
      )
      st.setPlanSelection({ type: 'room', id })
    },
    [levelId],
  )

  /** Commit an in-progress polyline annotation (open or closed) on the active
   *  storey (PARITY-POLYLINE). Needs ≥2 points; ≥3 to close. */
  const commitPolyline = useCallback(
    (verts: [number, number][], closed: boolean) => {
      if (verts.length < 2) return
      const st = useStore.getState()
      const id = st.addPolyline({
        points: verts,
        ...(closed && verts.length >= 3 ? { closed: true } : {}),
        ...(levelId !== GROUND_LEVEL_ID ? { levelId } : {}),
      })
      st.setPlanSelection({ type: 'polyline', id })
    },
    [levelId],
  )

  // Enter closes an in-progress polygon room; Esc cancels it (or exits the
  // editor when nothing is mid-draw); Delete removes the selected element.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      // A modal on top of the 2D editor owns the keyboard (incl. its own
      // Escape) — don't exit the editor / delete elements behind it.
      if (isAnyModalOpen()) return
      // A PLAN-FURNISH placement in progress owns Escape (cancel the armed
      // def, not the editor). The global `usePlacementController` listener
      // (App.tsx, shared with the 3D catalog) also calls `cancelPlacement()`
      // on the same keydown — calling it here too is a harmless no-op the
      // second time — but WITHOUT this early return, this effect's own
      // Escape branch (registered earlier, since the editor mounts before a
      // def gets armed) would run first and exit the whole plan editor.
      if (e.key === 'Escape' && fPlanFurnish && useStore.getState().activeDefId) {
        useStore.getState().cancelPlacement()
        return
      }
      if (e.key === 'Enter' && polylineDraft.length >= 2) {
        // Finish an in-progress polyline as an OPEN path.
        commitPolyline(polylineDraft, false)
        setPolylineDraft([])
      } else if (e.key === 'Enter' && polyDraft.length >= 3) {
        commitPolyRoom(polyDraft)
        setPolyDraft([])
      } else if (e.key === 'Escape') {
        // A toolbar dropdown (Plan / View) owns Escape to close itself — don't
        // also exit the editor in the same keypress.
        if (document.querySelector('.plan-menu-panel')) return
        // The numeric-entry overlay owns Escape when an input is focused —
        // let its own handler cancel the draft (don't also exit the editor).
        if (isEditableTarget(e)) return
        if (polylineDraft.length > 0) {
          setPolylineDraft([])
          return
        }
        if (polyDraft.length > 0) {
          setPolyDraft([])
          return
        }
        setDraft(null)
        setNumericPreviewEnd(null)
        exitPlanEditorToScene()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't hijack Backspace/Delete while editing a field (e.g. the room
        // name / dimension inputs in the inspector) — that would silently delete
        // the selected element.
        if (isEditableTarget(e)) return
        const st = useStore.getState()
        // A multi-wall selection deletes them all in one step (skips locked).
        const wallIds = [
          ...new Set([
            ...(st.planSelection?.type === 'wall' ? [st.planSelection.id] : []),
            ...st.selectedWallIds,
          ]),
        ]
        // A marquee can multi-select furniture (and/or walls). Bulk-delete the
        // furniture first: the loop coalesces under the 'delete' key so all the
        // pieces drop in ONE undo step (parity with the 3D delete path). Locked
        // items are pinned (skipped).
        const itemIds = st.selectedItemIds
        if (itemIds.length > 0) {
          const lockedIds = new Set(st.items.filter((i) => i.locked).map((i) => i.id))
          for (const id of [...itemIds]) {
            if (!lockedIds.has(id)) st.deleteItem(id)
          }
          // If the same marquee also caught walls, drop them too (their own
          // history step). Then we're done.
          if (wallIds.length > 0) st.removeWalls(wallIds, levelId)
          return
        }
        if (wallIds.length > 1) {
          st.removeWalls(wallIds, levelId)
          return
        }
        if (sel) {
          // Locked walls/openings can't be deleted (matches furniture lock).
          const lvl = levelById(st.floorPlan, levelId)
          if (sel.type === 'wall') {
            if (!lvl.walls.find((w) => w.id === sel.id)?.locked) st.removeWall(sel.id, levelId)
          } else if (sel.type === 'room') st.removeRoom(sel.id, levelId)
          else if (sel.type === 'note') st.removeNote(sel.id)
          else if (sel.type === 'dim') st.removeDimension(sel.id)
          else if (sel.type === 'polyline') st.removePolyline(sel.id)
          else if (!lvl.openings.find((o) => o.id === sel.id)?.locked)
            st.removeOpening(sel.id, levelId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    editing,
    sel,
    polyDraft,
    polylineDraft,
    commitPolyRoom,
    commitPolyline,
    levelId,
    fPlanFurnish,
  ])

  // PLAN-FURNISH Phase 1 — the armed def + its ghost. `itemLevelId` mirrors the
  // `addItem`/note/polyline convention in this file: an explicit id for an
  // upper storey, omitted (defaults to ground) for the ground level.
  const planDef = fPlanFurnish && activeDefId ? getDef(activeDefId) : undefined
  const itemLevelId = levelId !== GROUND_LEVEL_ID ? levelId : undefined
  const planGhostItem = useMemo(
    () =>
      planDef && planGhostWorld
        ? buildPlanGhostItem(planDef, planGhostWorld, ghostRotation, itemLevelId)
        : null,
    [planDef, planGhostWorld, ghostRotation, itemLevelId],
  )
  const planGhostIsValid = useMemo(() => {
    if (!planGhostItem || !planDef) return false
    return planGhostValid(planGhostItem, planDef, {
      others: items,
      defs: catalogRef.current,
      doors,
      walls: placementWalls(useStore.getState(), levelId),
    })
  }, [planGhostItem, planDef, items, doors, levelId, catalogRef])

  // Window-bound fixtures (curtains/blinds/grilles) aren't supported by the
  // Phase-1 plan ghost/commit (no window-snap branch here yet — see
  // `planFurnishPlacement.ts:isPlanPlaceable`); disarm immediately with an
  // explanatory toast instead of showing a ghost that can never commit.
  useEffect(() => {
    if (!fPlanFurnish || !planDef) return
    if (isPlanPlaceable(planDef)) return
    useStore.getState().notify.start({
      kind: 'info',
      title: 'Not supported in the plan yet',
      message: `${planDef.name} can only be placed from the 3D room editor for now.`,
    })
    useStore.getState().cancelPlacement()
    // planDef itself is derived from activeDefId — this effect intentionally
    // re-runs only when the armed def (or the flag) changes, not on every
    // unrelated re-render.
  }, [planDef, fPlanFurnish])

  // Arming a placement always shows furniture footprints (otherwise the just
  // placed piece would be invisible/unselectable — `showFurniture` defaults
  // off so editing walls/rooms isn't cluttered).
  useEffect(() => {
    if (fPlanFurnish && activeDefId) setShowFurniture(true)
  }, [fPlanFurnish, activeDefId])

  // Leaving Edit mode (View is pan/inspect-only) cancels an in-progress
  // placement rather than stranding an armed ghost nothing can commit.
  useEffect(() => {
    if (fPlanFurnish && activeDefId && editMode !== 'edit') useStore.getState().cancelPlacement()
  }, [fPlanFurnish, activeDefId, editMode])

  // Disarming (commit / cancel / escape / switching surfaces) drops the stale
  // preview point so a later re-arm never flashes the ghost at the last spot
  // before the next pointer move.
  useEffect(() => {
    if (!activeDefId) setPlanGhostWorld(null)
  }, [activeDefId])

  if (!editing) return null

  // Screen↔world coordinate mapping (grid/guide snap, wall magnetism, the
  // wall-draw angle-then-wall-snap pipeline) — see `editor/planPointerMapping.ts`.
  // Recreated every render (as the inline closures it replaces were) so it
  // always closes over the current W/H/PX/snap/walls.
  const { pointerPlanRaw, pointerWorld, wallDrawEnd, nearestWall, alongWall } =
    createPlanPointerMapping({
      svgRef,
      W,
      H,
      PX,
      snap,
      fGuides,
      guides: plan.guides,
      walls: levelPlan.walls,
    })

  // Start a canvas pan from a pointer-down (used by middle/right-drag, view mode,
  // and mobile-edit drags that aren't moving the selected item).
  const startPan = (e: React.PointerEvent) => {
    if (!canvasRef.current) return
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      sl: canvasRef.current.scrollLeft,
      st: canvasRef.current.scrollTop,
    }
    panDidMove.current = false
    // Guard capture (a stale/synthetic pointerId throws InvalidPointerId on some
    // browsers, which must not abort the pan) — matches the other capture sites.
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {}
  }

  /**
   * Decide whether a pointer-down on a draggable element starts a MOVE. View
   * mode never moves; on touch, edit mode requires the element to already be
   * selected (tap first). When true it has captured the pointer + stopped
   * propagation; when false the caller just selects and lets the gesture bubble
   * to the canvas pan.
   */
  const beginElementDrag = (e: React.PointerEvent, isSelectedNow: boolean): boolean => {
    // Mark that this press hit a selectable element — even on the paths that
    // return `false` below (which don't stopPropagation), so the bubbled canvas
    // `onDown` can suppress the empty-canvas marquee that would otherwise clear
    // the selection this element makes.
    elementTapped.current = true
    if (editMode !== 'edit') return false
    if (isMobile && !isSelectedNow) return false
    e.stopPropagation()
    // Pointer capture keeps the drag tracking even if the pointer leaves the
    // handle; guard it (a stale/synthetic pointerId throws InvalidPointerId on
    // some browsers, which must not abort the gesture).
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {}
    return true
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touchPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touchPts.current.size >= 2) {
        // Second finger down → pinch-zoom. Abandon whatever single-finger gesture
        // the first finger started (pan / draw / element drag) so it doesn't run
        // underneath the zoom or commit on lift.
        const [a2, b2] = [...touchPts.current.values()]
        pinch.current = { dist: Math.hypot(a2.x - b2.x, a2.y - b2.y) || 1, zoom: zoomRef.current }
        panRef.current = null
        setDraft(null)
        setMarquee(null)
        setMoving(null)
        setMovingItem(null)
        setMovingVertex(null)
        setMovingPolyVertex(null)
        setMovingBulge(null)
        setMovingWall(null)
        setRotatingWall(null)
        setRotatingItem(null)
        setRotatingMulti(null)
        setScalingMulti(null)
        setMovingOpening(null)
        setMovingStop(null)
        setMovingNote(null)
        setMovingRoomLabel(null)
        return
      }
    }
    // Middle- OR right-button drags pan the open canvas (orbit-style: a drag
    // moves the view, leaving the left button free to draw/select). The right
    // button's context menu is suppressed in onContextMenu when a pan moved.
    if ((e.button === 1 || e.button === 2) && canvasRef.current) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    // PLAN-FURNISH Phase 1: a left click while a catalog def is armed commits
    // (or rejects) the ghost at THIS click's own pointer position — mirrors
    // the 3D `usePlacementController`'s canvas-click commit, reusing the same
    // `addItem` → `beginDrop` → `pendingEdit` path with the active storey's
    // `levelId` passed explicitly (addItem can't infer it outside the room
    // editor). The click is swallowed either way so it never also starts a
    // marquee/pan/tool underneath the placement.
    if (fPlanFurnish && activeDefId) {
      const def = getDef(activeDefId)
      if (def) {
        const [wx, wz] = pointerWorld(e)
        const ghost = buildPlanGhostItem(def, [wx, wz], ghostRotation, itemLevelId)
        const st = useStore.getState()
        const valid = planGhostValid(ghost, def, {
          others: st.items,
          defs: catalogRef.current,
          doors: st.doors,
          walls: placementWalls(st, levelId),
        })
        if (decidePlanCommit(def, valid) === 'commit') {
          const priorItems = st.items
          const newId = st.addItem({
            defId: def.id,
            position: ghost.position,
            rotation: ghost.rotation,
            props: ghost.props,
            ...(itemLevelId ? { levelId: itemLevelId } : {}),
          })
          // Tactile drop-in, same as the 3D commit path.
          beginDrop(newId, performance.now())
          st.setActiveDefId(null)
          setPlanGhostWorld(null)
          st.setPendingEdit({ kind: 'placement', ids: [newId], originals: [], priorItems })
        }
        // 'invalid' (red ghost) / 'ineligible' (window-bound, already toasted
        // + disarmed by the effect above): swallow the click, nothing to do.
      }
      return
    }
    // View mode: any drag pans (touch + mouse). In edit mode the select tool
    // instead rubber-band marquee-selects on empty canvas (handled in the tool
    // dispatch below) — desktop AND mobile; mobile navigation uses two-finger
    // pinch (zoom + recentre). The selected item's handler captures before this
    // runs; an unselected item's fall-through reaches the empty-canvas marquee,
    // which a tap (zero-area) treats as a click so the selection is preserved.
    if (editMode === 'view') {
      startPan(e)
      return
    }
    const [wx, wz] = pointerWorld(e, undefined, tool === 'wall')
    const st = useStore.getState()
    if (tool === 'wall' && isMobile) {
      // Touch: tap-to-place chaining (precise — each point snaps to grid/walls,
      // and you tap an exact spot instead of guessing a drag's lift-off under
      // your finger). No anchor yet → this taps the start; an anchor exists →
      // this sets the end (onUp commits + chains from it). A press-drag in one
      // gesture still works (the end follows the finger before release).
      wallTapHadAnchor.current = draft !== null
      setNumericPreviewEnd(null)
      // Chaining from an anchor: aim the end onto an angle increment (Shift to
      // bypass) just like the desktop drag; the first tap just drops the anchor.
      if (draft) {
        const [ex, ez] = wallDrawEnd(e, [draft.x0, draft.z0])
        setDraft({ ...draft, x: ex, z: ez })
      } else {
        setDraft({ x0: wx, z0: wz, x: wx, z: wz })
      }
    } else if (tool === 'wall' || tool === 'room' || tool === 'scale' || tool === 'dimension') {
      setNumericPreviewEnd(null)
      setDraft({ x0: wx, z0: wz, x: wx, z: wz })
    } else if (tool === 'autoroom') {
      // Make a room from the active storey's wall loop enclosing the click.
      const lvl = levelById(st.floorPlan, levelId)
      if (lvl.rooms.some((r) => pointInRoom(r, wx, wz))) {
        // Already allocated here — don't stack a duplicate room on top.
        st.notify.start({ title: 'This area is already a room', kind: 'info' })
      } else {
        // Walls enclose the area regardless of any doors/windows in them
        // (openings don't break a wall), so a room with openings still detects.
        const poly = detectRoomPolygon(lvl.walls, [wx, wz])
        if (poly) commitPolyRoom(poly)
        else
          st.notify.start({
            title: 'No enclosing walls here — draw a closed wall loop first',
            kind: 'info',
          })
      }
    } else if (tool === 'polyroom') {
      // Click near the first vertex (≥3 placed) closes the polygon into a room.
      const action = polygonClick(polyDraft, [wx, wz])
      if (action.type === 'close') {
        commitPolyRoom(polyDraft)
        setPolyDraft([])
      } else {
        setPolyDraft((p) => [...p, action.point])
      }
    } else if (tool === 'polyline') {
      // Click adds a vertex; clicking the first vertex (≥3) closes the loop;
      // Enter finishes as an open path, Escape cancels (PARITY-POLYLINE).
      const action = polygonClick(polylineDraft, [wx, wz])
      if (action.type === 'close') {
        commitPolyline(polylineDraft, true)
        setPolylineDraft([])
      } else {
        setPolylineDraft((p) => [...p, action.point])
      }
    } else if (tool === 'split') {
      // Split the wall nearest the click at the projected point.
      const hit = nearestWall(wx, wz)
      if (hit) {
        const len = wallLength(hit.wall)
        st.splitWall(hit.wall.id, len > 0 ? hit.offset / len : 0.5, levelId)
      }
    } else if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(wx, wz)
      if (hit) {
        const width = tool === 'door' ? 0.9 : 1.2
        // Offsets are arc-length on a curved wall, chord length on a straight one.
        const wlen = isCurvedWall(hit.wall) ? wallArcLength(hit.wall) : wallLength(hit.wall)
        const offset = Math.max(0, Math.min(wlen - width, hit.offset - width / 2))
        const snapped = snap(offset)
        // On a sloped wall, openings live in the rectangular lower band — clamp
        // the head (and a window's sill) to the wall's min top height so the
        // opening stays clear of the slope wedge above it.
        const minTop = isSlopedWall(hit.wall)
          ? Math.min(...slopedWallHeights(hit.wall, st.floorPlan.ceilingHeight))
          : Number.POSITIVE_INFINITY
        const head = Math.min(2.1, minTop)
        const sill = tool === 'door' ? 0 : Math.max(0, Math.min(0.95, head - 0.4))
        const id = st.addOpening(
          {
            kind: tool,
            wallId: hit.wall.id,
            offset: snapped,
            width,
            sill,
            head,
            // Orient a new door to open into the room it serves (convention) —
            // judged against the active storey's rooms.
            ...(tool === 'door'
              ? {
                  swing: defaultDoorSwing(
                    levelAsPlan(st.floorPlan, levelById(st.floorPlan, levelId)),
                    hit.wall,
                    snapped,
                    width,
                  ),
                }
              : {}),
          },
          levelId,
        )
        st.setPlanSelection({ type: 'opening', id })
      }
    } else if (tool === 'text') {
      // Place a free-text note at the click (PARITY-DIMTEXT); prompt for text.
      void (async () => {
        const text = await st.promptText({
          title: 'Add a note',
          label: 'Note text',
          submitLabel: 'Add note',
        })
        if (!text) return
        const id = st.addNote({
          x: wx,
          z: wz,
          text,
          ...(levelId !== GROUND_LEVEL_ID ? { levelId } : {}),
        })
        st.setPlanSelection({ type: 'note', id })
      })()
    } else {
      // The press landed on a selectable element (its handler already ran and
      // set the selection, then let the event bubble here). Don't start a
      // marquee — its zero-area (tap) resolution in `onUp` would clear that very
      // selection. This is the touch tap-to-select path (desktop element presses
      // stopPropagation in `beginElementDrag`, so they never reach here).
      if (elementTapped.current) return
      // Empty-canvas press with the select tool: begin a rubber-band marquee
      // (PARITY-PLAN-MARQUEE). We don't clear the selection yet — that happens
      // on pointer-up only if the marquee stayed a click (zero-area), so a drag
      // that selects nothing clears, and a plain tap on a just-selected item
      // (mobile fall-through) is preserved. Raw (unsnapped) coords track the
      // cursor smoothly.
      const [rx, rz] = pointerPlanRaw(e)
      setMarquee({ x0: rx, z0: rz, x1: rx, z1: rz })
      try {
        svgRef.current?.setPointerCapture(e.pointerId)
      } catch {}
    }
  }

  const onMove = (e: React.PointerEvent) => {
    if (svgRef.current) lastPlanPtRef.current = pointerPlanRaw(e)
    if (pinch.current && e.pointerType === 'touch') {
      if (touchPts.current.has(e.pointerId)) {
        touchPts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      if (touchPts.current.size >= 2) {
        const [a2, b2] = [...touchPts.current.values()]
        const dist = Math.hypot(a2.x - b2.x, a2.y - b2.y)
        zoomToPoint(
          pinch.current.zoom * (dist / pinch.current.dist),
          (a2.x + b2.x) / 2,
          (a2.y + b2.y) / 2,
        )
      }
      return
    }
    if (panRef.current && canvasRef.current) {
      panDidMove.current = true
      canvasRef.current.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x)
      canvasRef.current.scrollTop = panRef.current.st - (e.clientY - panRef.current.y)
      return
    }
    // PLAN-FURNISH Phase 1: while a def is armed, track the ghost instead of
    // any other drag/tool state (none can be active at once — arming took
    // over `onDown` above). Grid-snapped, same as every other plan-space
    // placement/move.
    if (fPlanFurnish && activeDefId) {
      setPlanGhostWorld(pointerWorld(e))
      return
    }
    if (movingStop) {
      const [wx, wz] = pointerWorld(e)
      const newPos: [number, number] = [
        Math.round((wx - movingStop.gx) * 100) / 100,
        Math.round((wz - movingStop.gz) * 100) / 100,
      ]
      useStore.getState().updatePanoTourStop(movingStop.id, { position: newPos })
      return
    }
    if (movingNote) {
      const [wx, wz] = pointerWorld(e)
      useStore
        .getState()
        .updateNote(movingNote.id, { x: snap(wx - movingNote.gx), z: snap(wz - movingNote.gz) })
      return
    }
    if (movingRoomLabel) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const room = levelPlan.rooms.find((r) => r.id === movingRoomLabel.id)
      if (room) {
        // Offset = new label world position − the room's centroid.
        const [cx, cz] = roomLabelPoint(room)
        const lx = snap(wx - movingRoomLabel.gx)
        const lz = snap(wz - movingRoomLabel.gz)
        st.updateRoom(room.id, { labelOffset: [lx - cx, lz - cz] })
      }
      return
    }
    if (movingVertex) {
      const [wx, wz] = pointerWorld(e, movingVertex.id)
      // PARITY-PLAN-VERTEX-ANGLESNAP: dragging an existing wall endpoint snaps to a
      // 15° increment off the OTHER (fixed) end — the same ortho/angle snap that
      // wall-drawing uses — so an existing wall can be squared up, not just
      // newly-drawn ones. Shift bypasses it (free drag). `moveWallVertex` still
      // applies its own corner/join snap afterwards (order: angle → wall-snap).
      const wall = levelPlan.walls.find((w) => w.id === movingVertex.id)
      const aimed: [number, number] = wall
        ? vertexDragTarget(wall.start, wall.end, movingVertex.which, [wx, wz], e.shiftKey)
        : [wx, wz]
      useStore.getState().moveWallVertex(movingVertex.id, movingVertex.which, aimed, levelId)
      return
    }
    if (movingBulge) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const wall = levelPlan.walls.find((w) => w.id === movingBulge.id)
      if (wall) {
        let arc = Math.round(arcFromMidpoint(wall.start, wall.end, [wx, wz]) * 100) / 100
        // Snap back to a perfectly straight wall when the midpoint is within
        // ~12 px of the chord — even off a grid line — so flattening a curve is
        // easy. Clearing `arc` (undefined) makes the wall straight again.
        if (Math.abs(arc) * PX < 12) arc = 0
        st.updateWall(wall.id, { arc: arc === 0 ? undefined : arc }, levelId)
      }
      return
    }
    if (movingWall) {
      const [wx, wz] = pointerWorld(e)
      // Snap the DELTA so the wall stays rigid and moves in grid steps.
      const dx = snap(wx - movingWall.grab[0])
      const dz = snap(wz - movingWall.grab[1])
      const ns: [number, number] = [movingWall.s0[0] + dx, movingWall.s0[1] + dz]
      const ne: [number, number] = [movingWall.e0[0] + dx, movingWall.e0[1] + dz]
      useStore.getState().moveWallTo(movingWall.id, ns, ne, levelId)
      return
    }
    if (rotatingWall) {
      const [wx, wz] = pointerWorld(e)
      const { start, end } = rotateWallTransform(
        [rotatingWall.cx, rotatingWall.cz],
        rotatingWall.a0,
        wx,
        wz,
        rotatingWall.s0,
        rotatingWall.e0,
        snap,
      )
      useStore.getState().moveWallTo(rotatingWall.id, start, end, levelId)
      return
    }
    if (rotatingMulti) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const pivot: [number, number] = [rotatingMulti.cx, rotatingMulti.cz]
      const angle = pointerAngle(rotatingMulti.cx, rotatingMulti.cz, wx, wz)
      // Delta from the grab angle (snap to 15° unless Shift); startRot 0 → a delta.
      const delta = computeRotation(0, rotatingMulti.a0, angle, !e.shiftKey)
      const moveSet = new Set(rotatingMulti.originals.map((o) => o.id))
      const others = st.items.filter((o) => !moveSet.has(o.id))
      const next = rotatingMulti.originals.map((o) => ({
        id: o.id,
        position: rotatePointAround(o.position[0], o.position[1], pivot[0], pivot[1], delta),
        rotation: o.rotation + delta,
      }))
      const ok = next.every((n) => {
        const m = st.items.find((i) => i.id === n.id)
        const d = m && catalogRef.current[m.defId]
        if (!m || !d || m.locked) return true
        return canPlace({ ...m, position: n.position, rotation: n.rotation }, d, {
          others,
          defs: catalogRef.current,
          doors: st.doors,
          walls: placementWalls(st, m.levelId),
        })
      })
      if (ok)
        for (const n of next) {
          const m = st.items.find((i) => i.id === n.id)
          if (m && !m.locked) {
            st.moveItem(n.id, n.position)
            st.rotateItem(n.id, n.rotation)
          }
        }
      return
    }
    if (scalingMulti) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const pivot = scalingMulti.pivot
      const dist = Math.hypot(wx - pivot[0], wz - pivot[1])
      // Uniform group scale factor about the pivot (shared with the 3D ResizeGizmo).
      const f = groupResizeFactor(scalingMulti.grabDist, dist)
      const origById = new Map(scalingMulti.originals.map((o) => [o.id, o]))
      const others = st.items.filter((o) => !origById.has(o.id))
      const cand = st.items.map((it) => {
        const o = origById.get(it.id)
        if (!o || it.locked) return it
        const r = resizedTransform(o.position, o.scale, pivot, f)
        const ns = r.scale
        return {
          ...it,
          position: r.position,
          props: { ...it.props, scale: ns, scaleX: ns, scaleY: ns, scaleZ: ns },
        }
      })
      const ok = scalingMulti.originals.every((o) => {
        const cit = cand.find((c) => c.id === o.id)
        const d = cit && catalogRef.current[cit.defId]
        if (!cit || !d) return true
        if (st.items.find((i) => i.id === o.id)?.locked) return true
        return canPlace(cit, d, {
          others,
          defs: catalogRef.current,
          doors: st.doors,
          walls: placementWalls(st, cit.levelId),
        })
      })
      if (ok) st.setItems(cand)
      return
    }
    if (rotatingItem) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const it = st.items.find((i) => i.id === rotatingItem.id)
      const def = it ? catalogRef.current[it.defId] : undefined
      if (!it || !def) return
      // Reuse the 3D gizmo math: rotation tracks the handle relative to the grab,
      // snapping to 15° marks unless Shift is held (free rotation), matching the
      // wall rotate ring + the scene RotateGizmo. Plan world coords map x→x, z→z.
      const angle = pointerAngle(rotatingItem.cx, rotatingItem.cz, wx, wz)
      const next = computeRotation(rotatingItem.startRot, rotatingItem.a0, angle, !e.shiftKey)
      // Only commit a rotation that doesn't collide with walls or other items —
      // same rule the item move + 3D gizmo enforce. An invalid angle is skipped,
      // leaving the last valid orientation in place (no revert needed mid-drag).
      const planWalls = placementWalls(st, it.levelId)
      const others = st.items.filter((o) => o.id !== it.id)
      if (
        canPlace({ ...it, rotation: next }, def, {
          others,
          defs: catalogRef.current,
          doors: st.doors,
          walls: planWalls,
        })
      )
        st.rotateItem(it.id, next)
      return
    }
    if (movingOpening) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const o = levelPlan.openings.find((x) => x.id === movingOpening.id)
      const wall = o && levelPlan.walls.find((w) => w.id === o.wallId)
      if (o && wall) {
        const span = isCurvedWall(wall) ? wallArcLength(wall) : wallLength(wall)
        const along = alongWall(wall, wx, wz)
        // Keep the grabbed point under the cursor; clamp so the opening stays
        // wholly on the wall.
        const offset = Math.max(0, Math.min(span - o.width, snap(along - movingOpening.grab)))
        st.updateOpening(o.id, { offset }, levelId)
      }
      return
    }
    if (movingPolyVertex) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const room = levelPlan.rooms.find((r) => r.id === movingPolyVertex.id)
      if (room?.polygon) {
        const poly = room.polygon.map((p, i) =>
          i === movingPolyVertex.index ? ([wx, wz] as [number, number]) : p,
        )
        // Keep origin/width/depth in sync as the polygon's bbox (back-compat for
        // consumers that still read the rect; the polygon stays authoritative).
        const { origin, width, depth } = rectFromVerts(poly)
        st.updateRoom(room.id, { polygon: poly, origin, width, depth })
      }
      return
    }
    if (movingItem) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const it = st.items.find((i) => i.id === movingItem.id)
      const def = it ? catalogRef.current[it.defId] : undefined
      if (!it || !def) return
      const pos: [number, number] = [snap(wx - movingItem.gx), snap(wz - movingItem.gz)]
      // Multi-select drag: move the whole selection rigidly by the same delta as
      // the grabbed item (mirrors the 3D DragController). Only commit when EVERY
      // mover is collision-free, so the group stays put rather than partly moving.
      const selIds = st.selectedItemIds
      if (selIds.length > 1 && selIds.includes(it.id)) {
        const dx = pos[0] - it.position[0]
        const dz = pos[1] - it.position[1]
        if (dx === 0 && dz === 0) return
        const moveSet = new Set(selIds)
        const movers = st.items.filter((m) => moveSet.has(m.id) && !m.locked)
        const others = st.items.filter((o) => !moveSet.has(o.id))
        const ok = movers.every((m) => {
          const d = catalogRef.current[m.defId]
          if (!d) return true
          return canPlace({ ...m, position: [m.position[0] + dx, m.position[1] + dz] }, d, {
            others,
            defs: catalogRef.current,
            doors: st.doors,
            walls: placementWalls(st, m.levelId),
          })
        })
        if (ok) for (const m of movers) st.moveItem(m.id, [m.position[0] + dx, m.position[1] + dz])
        return
      }
      // Validate against the ITEM's storey walls (shared placement-wall rule —
      // ground items on the default flat get its door-aware walls via canPlace).
      const planWalls = placementWalls(st, it.levelId)
      const others = st.items.filter((o) => o.id !== it.id)
      // Only commit a move that doesn't collide with walls or other items —
      // same rule the 3D DragController enforces.
      if (
        canPlace({ ...it, position: pos }, def, {
          others,
          defs: catalogRef.current,
          doors: st.doors,
          walls: planWalls,
        })
      )
        st.moveItem(it.id, pos)
      return
    }
    if (moving) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const nextOrigin: [number, number] = [snap(wx - moving.gx), snap(wz - moving.gz)]
      const room = st.floorPlan.rooms.find((r) => r.id === moving.id)
      // A free-form (polygon) room stores ABSOLUTE polygon points, so moving the
      // origin alone wouldn't shift its outline — translate the polygon by the
      // same delta so the whole room (rect or polygon) moves together.
      if (room?.polygon && room.polygon.length > 0) {
        const dx = nextOrigin[0] - room.origin[0]
        const dz = nextOrigin[1] - room.origin[1]
        st.updateRoom(moving.id, {
          origin: nextOrigin,
          polygon: room.polygon.map(([px, pz]) => [px + dx, pz + dz] as [number, number]),
        })
      } else {
        st.updateRoom(moving.id, { origin: nextOrigin })
      }
      return
    }
    if (movingDimEnd) {
      const [wx, wz] = pointerWorld(e)
      useStore
        .getState()
        .updateDimension(movingDimEnd.id, { [movingDimEnd.which]: [snap(wx), snap(wz)] })
      return
    }
    if (marquee) {
      const [rx, rz] = pointerPlanRaw(e)
      setMarquee({ ...marquee, x1: rx, z1: rz })
      return
    }
    if (!draft) return
    const [wx, wz] = tool === 'wall' ? wallDrawEnd(e, [draft.x0, draft.z0]) : pointerWorld(e)
    setDraft({ ...draft, x: wx, z: wz })
  }

  const onUp = (e?: React.PointerEvent) => {
    // Snapshot whether this gesture's press landed on a selectable element, then
    // clear the per-gesture flag so the next empty-canvas press can start a
    // marquee again. The snapshot lets the pan-release branch below preserve a
    // View-mode tap-to-inspect (the element already selected itself; the bubbled
    // pan must not immediately deselect it — that was the select→deselect flicker).
    const tappedElement = elementTapped.current
    elementTapped.current = false
    if (e?.pointerType === 'touch') {
      const wasPinching = pinch.current !== null
      touchPts.current.delete(e.pointerId)
      if (touchPts.current.size < 2) pinch.current = null
      // A lift during/after a pinch must not commit a draft or selection drag
      // (those were cancelled when the second finger landed); while a finger is
      // still down, keep waiting rather than running the single-touch up logic.
      if (wasPinching || touchPts.current.size >= 1) return
    }
    // A moving gesture (item/wall/vertex/opening/…) pushes an undo snapshot on
    // grab; if the grab didn't move anything, drop the redundant entry so the
    // first undo isn't a dead step (BUG-016). A no-op when a real edit changed a
    // store reference, and when the grab never pushed.
    useStore.getState().dropRedundantHistory()
    if (panRef.current) {
      const moved = panDidMove.current
      panRef.current = null
      // A tap (not a drag) on the EMPTY canvas in select mode clears the
      // selection — the desktop edit path already deselects on pointer-down via
      // the `else` in onDown; this covers view mode + touch, which pan instead. A
      // tap that landed on an element is excluded (`tappedElement`) so View-mode
      // tap-to-inspect keeps its selection instead of flickering it away.
      if (clearsSelectionOnPanRelease({ moved, tool, tappedElement })) {
        // A tap on empty canvas clears every selection (plan element + placed
        // furniture), which closes the property panels keyed off them.
        const st = useStore.getState()
        st.setPlanSelection(null)
        st.selectItem(null)
      }
      return
    }
    if (marquee) {
      const rect = marquee
      setMarquee(null)
      // Build the candidate footprints / segments for the active storey and run
      // the pure intersection test. A zero-area (click-sized) marquee returns no
      // hits → fall through to a plain deselect, so a tap on empty canvas still
      // clears, while a tap that just selected an item (mobile) is preserved
      // because the item handler ran first and this only clears the *plan*
      // element selection (selectedWallIds), not selectedItemId.
      // Only footprints that are actually shown (the Furniture toggle) are
      // selectable — mirror the render gate so the marquee can't grab invisible
      // pieces.
      const candItems: MarqueeItem[] = []
      if (showFurniture) {
        for (const it of levelItems) {
          const def = getDef(it.defId)
          if (!def) continue
          candItems.push({ id: it.id, obb: itemFootprint(it, def) })
        }
      }
      const candWalls = levelPlan.walls.map((w) => ({
        id: w.id,
        segment: { ax: w.start[0], az: w.start[1], bx: w.end[0], bz: w.end[1] },
      }))
      const hits = marqueeSelect(rect, candItems, candWalls)
      const st = useStore.getState()
      if (hits.itemIds.length === 0 && hits.wallIds.length === 0) {
        // Drag selected nothing (or was a click) → clear the selection.
        st.setPlanSelection(null)
        st.selectItem(null)
      } else {
        st.setPlanMarqueeSelection(hits.itemIds, hits.wallIds)
      }
      return
    }
    if (movingStop) {
      // Evict the IDB cache entry for this stop so the next tour view recaptures
      // from the new position.
      void evictPanoStop(movingStop.id)
      setMovingStop(null)
      return
    }
    if (movingNote) {
      setMovingNote(null)
      return
    }
    if (movingRoomLabel) {
      setMovingRoomLabel(null)
      return
    }
    if (movingVertex) {
      setMovingVertex(null)
      return
    }
    if (movingPolyVertex) {
      setMovingPolyVertex(null)
      return
    }
    if (movingBulge) {
      setMovingBulge(null)
      return
    }
    if (movingWall) {
      setMovingWall(null)
      return
    }
    if (rotatingWall) {
      setRotatingWall(null)
      return
    }
    if (rotatingItem) {
      setRotatingItem(null)
      return
    }
    if (rotatingMulti) {
      setRotatingMulti(null)
      return
    }
    if (scalingMulti) {
      setScalingMulti(null)
      return
    }
    if (movingOpening) {
      setMovingOpening(null)
      return
    }
    if (movingItem) {
      setMovingItem(null)
      return
    }
    if (moving) {
      setMoving(null)
      return
    }
    if (movingDimEnd) {
      setMovingDimEnd(null)
      return
    }
    if (!draft) return
    const st = useStore.getState()
    if (tool === 'scale') {
      // Calibrate: the dragged span equals a real length the user types, so the
      // backdrop rescales (mPerPx) to match. No walls created. The rescale is
      // anchored on the drawn segment's midpoint so the image feature the user
      // just measured stays under their line instead of sliding away.
      const worldDist = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
      const anchorX = (draft.x0 + draft.x) / 2
      const anchorZ = (draft.z0 + draft.z) / 2
      if (backdrop && scaleCommits(draft)) {
        void (async () => {
          const input = await useStore.getState().promptText({
            title: 'Calibrate scale',
            label: 'Real length of the line you drew (metres)',
            defaultValue: '1',
            numeric: true,
            submitLabel: 'Set scale',
          })
          const meters = input ? Number.parseFloat(input) : NaN
          if (Number.isFinite(meters) && meters > 0) {
            setBackdrop((b) =>
              b
                ? {
                    ...b,
                    ...rescaleBackdropAnchored(
                      b,
                      (b.mPerPx * meters) / worldDist,
                      anchorX,
                      anchorZ,
                    ),
                  }
                : b,
            )
          }
        })()
      }
      setDraft(null)
      return
    }
    if (tool === 'dimension') {
      // Commit a custom dimension line between the dragged endpoints (snapped).
      const dim = dimensionCommit(draft, snap)
      if (dim) {
        const id = st.addDimension({
          a: dim.a,
          b: dim.b,
          ...(levelId !== GROUND_LEVEL_ID ? { levelId } : {}),
        })
        st.setPlanSelection({ type: 'dim', id })
      }
      setDraft(null)
      return
    }
    if (tool === 'wall' && isMobile) {
      // Touch tap-to-place: a real segment commits and the chain continues from
      // its end (tap the next point to keep going). A tap on/near the anchor (no
      // segment) ends the chain; the very first tap just keeps the anchor.
      if (wallTapCommits(draft)) {
        const id = st.addWall(
          { start: [draft.x0, draft.z0], end: [draft.x, draft.z], thickness: wallType },
          levelId,
        )
        st.setPlanSelection({ type: 'wall', id })
        setDraft({ x0: draft.x, z0: draft.z, x: draft.x, z: draft.z }) // chain from the end
      } else if (wallTapHadAnchor.current) {
        setDraft(null) // tapped the anchor again → finish the chain
      }
      // else: first tap just placed the anchor — keep it (draft stays).
      return
    }
    if (tool === 'wall') {
      // Use the numeric-entry preview endpoint if the user typed one.
      const wall = wallCommit(draft, numericPreviewEnd)
      if (wall) {
        const id = st.addWall({ start: wall.start, end: wall.end, thickness: wallType }, levelId)
        st.setPlanSelection({ type: 'wall', id })
      }
      setNumericPreviewEnd(null)
    } else if (tool === 'room') {
      const rect = roomCommit(draft)
      if (rect) {
        const n = levelById(st.floorPlan, levelId).rooms.length + 1
        const id = st.addRoom(
          { name: `Room ${n}`, origin: rect.origin, width: rect.width, depth: rect.depth },
          levelId,
        )
        st.setPlanSelection({ type: 'room', id })
      }
    }
    setDraft(null)
  }

  // Area + room count for the ACTIVE storey (matches what's on the canvas).
  const total = planTotalArea(levelPlan)
  // Only the active storey's furniture footprints overlay the plan.
  const levelItems = items.filter((it) => levelOfItem(plan, it).id === levelId)

  // Drawing tools (Polyline is a flagged Pro annotation tool).
  const toolList: Tool[] = [
    'select',
    'wall',
    'room',
    'polyroom',
    'autoroom',
    'split',
    'door',
    'window',
    'text',
    'dimension',
    ...(fPolyline ? (['polyline'] as Tool[]) : []),
  ]
  const toolLabel = (t: Tool): string =>
    t === 'polyroom'
      ? 'Polygon room'
      : t === 'autoroom'
        ? 'Auto room'
        : t.charAt(0).toUpperCase() + t.slice(1)
  const pickTool = (t: Tool) => {
    setPolyDraft([])
    setPolylineDraft([])
    setDraft(null) // drop any in-progress wall tap-chain / draft
    setTool(t)
    setEditMode('edit') // choosing a tool implies you want to edit
  }

  // View ⇄ Edit toggle. View = pan/zoom + tap-to-inspect (safe one-finger pan on
  // touch); Edit reveals the tools + lets you move/draw.
  const viewToggle = (
    <EditModeToggle
      editMode={editMode}
      onView={() => {
        setEditMode('view')
        setTool('select')
        setPolyDraft([])
        setPolylineDraft([])
        setDraft(null)
      }}
      onEdit={() => setEditMode('edit')}
    />
  )

  // The drawing-tool palette. Condensed so the whole bar stays ONE row: Select is
  // a pointer icon, Wall/Split are direct buttons, and the related tools collapse
  // into labelled dropdowns (Room / Opening / Markup). The mobile bar keeps its
  // single `PlanToolMenu` picker.
  const toolPalette = <DrawToolPalette tool={tool} onPick={pickTool} fPolyline={fPolyline} />

  // Live how-to-finish hint for the multi-click drawing tools (the "how do I
  // close it?" gap) — shown while the Polygon-room / Polyline tool is active.
  const drawHint =
    editMode === 'edit' && (tool === 'polyroom' || tool === 'polyline') ? (
      <span className="plan-draw-hint" role="status">
        {tool === 'polyroom'
          ? 'Click each corner · click the first corner or press Enter to finish the room · Esc cancels'
          : 'Click each point · Enter to finish · click the first point to close · Esc cancels'}
      </span>
    ) : null

  // External/internal thickness for newly-drawn walls (only meaningful for Wall).
  const wallTypeSeg = tool === 'wall' && (
    <WallTypeToggle wallType={wallType} onChange={setWallType} />
  )

  // Template + saved-plan library — primary plan entry points, kept inline.
  const templateLibrary = (
    <>
      <TemplatePicker />
      <PlanLibrary />
    </>
  )

  // File / reference actions — grouped behind the desktop "Plan ▾" menu (and
  // shown flat in the mobile Tools modal).
  const fileActions = (
    <>
      <button
        type="button"
        onClick={() => {
          // Fresh apartment: clear the inherited furniture (undoable) so the
          // new shell starts empty rather than full of the old layout.
          a.pushHistory()
          a.setItems([])
          a.newFloorPlan()
        }}
        title="Start a fresh, empty apartment shell"
        className="btn btn-sm"
      >
        New
      </button>
      <button type="button" onClick={() => a.resetFloorPlan()} className="btn btn-sm">
        Reset to HDB
      </button>
      {/* Mirror the whole plan (walls + rooms + openings + furniture) about its
          centre-X — for mirror-image HDB stacks / condo pairs
          (PARITY-PLAN-MIRROR-REGION), gated by the `planMirrorRegion` pro flag
          (hidden in Simple mode). One undoable action. */}
      {fMirrorRegion ? (
        <button
          type="button"
          onClick={() => a.mirrorFloorPlan()}
          title="Mirror the whole plan left↔right about its centre (for mirror-image stacks)"
          className="btn btn-sm"
        >
          Mirror plan
        </button>
      ) : null}
      {/* Snap the whole plan to the current grid — round every wall endpoint /
          room vertex / opening offset / annotation coordinate to clean up a
          traced or imported plan (PARITY-GRID-SNAP), gated by the `planGridSnap`
          pro flag (hidden in Simple mode). One undoable action. */}
      {fGridSnap ? (
        <button
          type="button"
          onClick={() => a.snapFloorPlanToGrid()}
          title="Round every wall, room, opening and annotation coordinate to the grid (cleans up a traced plan)"
          className="btn btn-sm"
        >
          Snap to grid
        </button>
      ) : null}
      {/* Persistent ruler guides (PARITY-PLAN-GUIDES) — pin an axis-aligned
          reference line at the cursor; points snap to it. Gated by `planGuides`
          (pro, hidden in Simple). */}
      {fGuides ? (
        <>
          <button
            type="button"
            onClick={() => a.addPlanGuide({ axis: 'x', pos: snap(lastPlanPtRef.current[0]) })}
            title="Pin a vertical guide line at the cursor — points snap to it"
            className="btn btn-sm"
          >
            + V guide
          </button>
          <button
            type="button"
            onClick={() => a.addPlanGuide({ axis: 'z', pos: snap(lastPlanPtRef.current[1]) })}
            title="Pin a horizontal guide line at the cursor — points snap to it"
            className="btn btn-sm"
          >
            + H guide
          </button>
          {(plan.guides?.length ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => a.clearPlanGuides()}
              title="Remove all ruler guides"
              className="btn btn-sm"
            >
              Clear guides
            </button>
          ) : null}
        </>
      ) : null}
      {/* Chained dimension strings (PARITY-DIM-CHAIN) — a row of consecutive
          dimensions along the plan's bottom + left baselines, gated by
          `dimensionChain` (pro, hidden in Simple). */}
      {fDimChain ? (
        <button
          type="button"
          onClick={() => {
            const n = a.addChainDimensions(levelId)
            if (n === 0)
              a.notify.start({ title: 'Add at least two walls to chain dimensions', kind: 'info' })
          }}
          title="Generate a row of dimension strings along this floor's edges"
          className="btn btn-sm"
        >
          Chain dims
        </button>
      ) : null}
      {/* Round / bevel the corner of two selected connected walls
          (PARITY-CORNER-FILLET), gated by `cornerFillet` (pro). Enabled only with
          exactly two walls selected. */}
      {fCornerFillet && selectedWalls.size === 2 ? (
        <>
          <button
            type="button"
            onClick={() => {
              const [w1, w2] = [...selectedWalls]
              if (!a.filletCorner(w1, w2, 0.3, 'round', levelId))
                a.notify.start({ title: 'Select two walls that meet at a corner', kind: 'info' })
            }}
            title="Round the corner where the two selected walls meet (0.3 m radius)"
            className="btn btn-sm"
          >
            Round corner
          </button>
          <button
            type="button"
            onClick={() => {
              const [w1, w2] = [...selectedWalls]
              if (!a.filletCorner(w1, w2, 0.3, 'bevel', levelId))
                a.notify.start({ title: 'Select two walls that meet at a corner', kind: 'info' })
            }}
            title="Bevel (chamfer) the corner where the two selected walls meet (0.3 m)"
            className="btn btn-sm"
          >
            Bevel corner
          </button>
        </>
      ) : null}
      {/* Reference photo — trace walls over a floor-plan image / room scan.
          Gated by the `planTraceBackdrop` pro flag (hidden in Simple mode). */}
      {fTraceBackdrop && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) loadBackdrop(f)
            e.target.value = ''
          }}
        />
      )}
      {!fTraceBackdrop ? null : !backdrop ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Load a floor-plan photo / scan to trace over"
          className="btn btn-sm"
        >
          Reference photo…
        </button>
      ) : (
        <div className="seg" style={{ alignItems: 'center', gap: 6, paddingRight: 6 }}>
          <button
            type="button"
            className={tool === 'scale' ? 'on' : ''}
            onClick={() => setTool(tool === 'scale' ? 'select' : 'scale')}
            title="Drag a line over a known dimension, then type its real length"
          >
            Set scale
          </button>
          <div style={{ width: 160 }}>
            <SliderField
              label="Trace opacity"
              ariaLabel="Trace image opacity"
              value={backdrop.opacity}
              min={0.05}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setBackdrop((b) => (b ? { ...b, opacity: v } : b))}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              setBackdrop((b) => {
                if (!b) return b
                const [ew, ed] = planBounds(plan)
                return { ...b, ...centerBackdrop(b, ew, ed) }
              })
            }
            title="Center the trace image on the plan"
          >
            Center
          </button>
          {aiWalls && (
            <button
              type="button"
              onClick={runAiWalls}
              disabled={aiBusy}
              title="Experimental: recognise walls from the photo with a vision model (your API key)"
            >
              {aiBusy ? 'Recognising…' : 'AI walls'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              removeBackdrop()
              if (tool === 'scale') setTool('select')
            }}
            title="Remove reference photo"
          >
            ✕
          </button>
        </div>
      )}
      {/* Scale the whole plan to a factor or a known wall length (PARITY-PLAN-SCALE),
          gated by the `planScale` pro flag (hidden in Simple mode). */}
      {fPlanScale ? (
        <button
          type="button"
          onClick={() => setScaleModalOpen(true)}
          title="Rescale the whole plan by a factor or to a known wall length"
          className="btn btn-sm"
        >
          Scale plan…
        </button>
      ) : null}
    </>
  )

  // Contextual multi-select toggle — inline (only with Select tool in Edit mode).
  const multiSelectToggle =
    tool === 'select' && editMode === 'edit' ? (
      <button
        type="button"
        onClick={() => a.setPlanWallMultiAdd(!planWallMultiAdd)}
        className={`btn btn-sm${planWallMultiAdd ? ' btn-accent' : ''}`}
        title="Select multiple walls: tap walls to add/remove them (or Shift-click). Then Delete or Lock them together."
        aria-pressed={planWallMultiAdd}
      >
        Select+
      </button>
    ) : null

  // Undo / redo (also ⌘Z / ⇧⌘Z) — visible buttons for touch, where there's no
  // keyboard. Important enough to sit in the mobile top bar, not just the menu.
  const undoRedo = (
    <UndoRedoButtons
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => useStore.getState().undo()}
      onRedo={() => useStore.getState().redo()}
    />
  )

  // Snap-grid size + zoom — frequent but lower-priority than undo/redo.
  const gridZoom = (
    <GridZoomControls
      gridSize={gridSize}
      onGridSizeChange={setGridSize}
      units={units}
      zoom={zoom}
      onZoomOut={() => zoomAroundCentre((z) => z - ZOOM_BTN_STEP)}
      onZoomIn={() => zoomAroundCentre((z) => z + ZOOM_BTN_STEP)}
      onResetView={resetView}
    />
  )

  // Frequent, compact controls kept inline on desktop: undo/redo + grid + zoom.
  const quickActions = (
    <>
      {undoRedo}
      {gridZoom}
    </>
  )

  // Occasional view toggles + export — grouped behind the desktop "View ▾" menu
  // (and shown flat in the mobile Tools modal).
  const viewMenuActions = (
    <PlanViewMenuActions
      fPlanLabels={fPlanLabels}
      labelsOn={labelsOn}
      planLabels={planLabels}
      onCycleLabels={() => useStore.getState().cyclePlanLabels()}
      showRoomLabels={showRoomLabels}
      onToggleRoomLabels={() => setShowRoomLabels((v) => !v)}
      showWallDims={showWallDims}
      onToggleWallDims={() => setShowWallDims((v) => !v)}
      showFurniture={showFurniture}
      onToggleFurniture={() => setShowFurniture((v) => !v)}
      skeleton={skeleton}
      onToggleSkeleton={() => setSkeleton((v) => !v)}
      isMultiLevel={isMultiLevel}
      showOtherLevels={showOtherLevels}
      onToggleOtherLevels={() => setShowOtherLevels((v) => !v)}
      onExportPng={() => {
        if (!svgRef.current) return
        const safe =
          (plan.name || 'floor-plan').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') ||
          'floor-plan'
        // Crop to the plan's bounding box + padding (not the whole open
        // canvas) so the exported image is just the plan.
        const crop = {
          x: (GRID_MARGIN - EXPORT_PAD) * PX,
          y: (GRID_MARGIN - EXPORT_PAD) * PX,
          w: (ew + EXPORT_PAD * 2) * PX,
          h: (ed + EXPORT_PAD * 2) * PX,
        }
        exportPlanPng(svgRef.current, safe, crop).catch(() =>
          a.notify.start({ title: "Couldn't export the plan image", kind: 'error' }),
        )
      }}
    />
  )

  const totalLabel = (
    <PlanTotalLabel
      total={total}
      units={units}
      roomCount={levelPlan.rooms.length}
      showStrayWarning={fIntegrity}
      strayCount={strayCount}
    />
  )

  // Plan-wide defaults (ceiling height + wall colour) — surfaced in the mobile
  // Tools modal (on desktop they live in the right-hand PlanInspector).
  const planDefaults = (
    <PlanDefaultsFields
      ceilingHeight={plan.ceilingHeight}
      wallColor={plan.wallColor}
      onCeilingHeightChange={(v) => a.updateFloorPlanMeta({ ceilingHeight: v })}
      onWallColorChange={(hex) => a.updateFloorPlanMeta({ wallColor: hex })}
    />
  )

  return (
    <div className="plan-screen absolute inset-0 z-30 flex flex-col">
      {/* Header/toolbar + help callout. On MOBILE `.plan-top` is pulled out of the
          flex column and FLOATS over the full-bleed grid (like the floor switcher /
          compass) so the canvas reaches the top edge; desktop keeps them in-flow
          above the canvas. Styling in responsive.css. */}
      <div className="plan-top">
        {/* Header / toolbar. Desktop stays a SINGLE row (`flex-nowrap` + horizontal
          scroll fallback so it can never spill to two rows); mobile keeps its
          short wrapping bar. */}
        <PlanEditorHeader
          isMobile={isMobile}
          toolsMenuOpen={toolsMenuOpen}
          onOpenToolsMenu={() => setToolsMenuOpen(true)}
          editMode={editMode}
          toolList={toolList}
          tool={tool}
          toolLabel={toolLabel}
          onPickTool={pickTool}
          viewToggle={viewToggle}
          drawHint={drawHint}
          undoRedo={undoRedo}
          onExit={exitPlanEditorToScene}
          planName={plan.name}
          onPlanNameChange={(v) => a.updateFloorPlanMeta({ name: v })}
          toolPalette={toolPalette}
          wallTypeSeg={wallTypeSeg}
          fPlanFurnish={fPlanFurnish}
          catalogOpen={catalogOpen}
          onToggleCatalog={() => {
            const next = !catalogOpen
            a.setCatalogOpen(next)
            if (next) setShowFurniture(true)
          }}
          templateLibrary={templateLibrary}
          fileActionsMenu={<PlanMenu label="Plan">{fileActions}</PlanMenu>}
          multiSelectToggle={multiSelectToggle}
          quickActions={quickActions}
          viewMenu={
            <PlanMenu
              label="View"
              active={
                showWallDims ||
                showFurniture ||
                skeleton ||
                labelsOn ||
                showOtherLevels ||
                !showRoomLabels
              }
            >
              {viewMenuActions}
            </PlanMenu>
          }
          totalLabel={totalLabel}
        />
        <div className="px-4 pt-2">
          <InfoCallout id="floor-plan" title="Editing your floor plan">
            Switch to Edit to draw walls and rooms; View just pans and zooms. Your 3D home updates
            live.
          </InfoCallout>
        </div>
      </div>
      {isMobile && (
        <PlanToolsSheet
          open={toolsMenuOpen}
          onClose={() => setToolsMenuOpen(false)}
          planName={plan.name}
          onPlanNameChange={(v) => a.updateFloorPlanMeta({ name: v })}
          templateLibrary={templateLibrary}
          fileActions={fileActions}
          viewMenuActions={viewMenuActions}
          gridZoom={gridZoom}
          wallTypeSeg={wallTypeSeg}
          multiSelectToggle={multiSelectToggle}
          planDefaults={planDefaults}
          totalLabel={totalLabel}
          onHelp={() => {
            setToolsMenuOpen(false)
            openDocs()
          }}
        />
      )}

      {/* Scale-plan dialog (PARITY-PLAN-SCALE) — opened from the "Scale plan…"
          action in the Plan menu / mobile Tools sheet. Mounted only when its flag
          is on so the modal never opens in Simple mode. */}
      {fPlanScale ? (
        <ScalePlanModal open={scaleModalOpen} onClose={() => setScaleModalOpen(false)} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Canvas column — a relative wrapper so the compass + scale-bar HUD pins
            to the CANVAS viewport's corner (not the whole editor frame, which on
            desktop would sit over the docked inspector). `min-w-0 overflow-hidden`
            constrains it to the flex track (the inner `.plan-canvas` scrolls), so
            `right:12` lands on the visible canvas edge, not past the wide SVG. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Floor (storey) selector — a dropdown pinned to the canvas bottom-left,
              listing floors topmost-first (mall-directory order) with rename +
              reorder. */}
          <LevelMenu plan={plan} activeLevelId={levelId} onSelect={setActiveLevelId} />
          {/* Compass + dynamic scale bar, each absolutely pinned to the canvas
              column's bottom-right corner (desktop AND mobile — on mobile the
              expanded inspector bottom-sheet may cover them, which is acceptable).
              Two explicit offsets rather than a flex stack so they never collapse
              onto each other: scale bar at the very corner, compass just above it. */}
          {fCompass ? (
            <>
              <div
                className="panel"
                style={{
                  position: 'absolute',
                  right: 12,
                  // Clear the iOS home indicator (0 on non-notched displays).
                  bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
                  zIndex: 5,
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  opacity: 0.9,
                  pointerEvents: 'none',
                }}
                aria-hidden
              >
                <svg
                  width={44}
                  height={44}
                  viewBox="-22 -22 44 44"
                  style={{ transform: `rotate(${-orientationDeg}deg)` }}
                >
                  <title>North compass</title>
                  <circle r={20} fill="none" stroke="var(--border-2)" strokeWidth={1} />
                  {/* North half (accent), South half (muted). */}
                  <polygon points="0,-16 5,0 -5,0" fill="var(--accent)" />
                  <polygon points="0,16 5,0 -5,0" fill="var(--text-3)" />
                  <text
                    x={0}
                    y={-15}
                    textAnchor="middle"
                    fontSize={7}
                    fontWeight={700}
                    fill="var(--text)"
                  >
                    N
                  </text>
                </svg>
              </div>
              {/* Dynamic scale bar — a real-world reference that rescales with the
                  zoom (PARITY-SCALEBAR). */}
              {(() => {
                const bar = chooseScaleBar(PX, units)
                return (
                  <div
                    className="panel"
                    style={{
                      position: 'absolute',
                      right: 12,
                      // Clear the iOS home indicator (0 on non-notched displays).
                      bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                      zIndex: 5,
                      padding: '4px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      pointerEvents: 'none',
                    }}
                    aria-hidden
                  >
                    <svg width={bar.px + 2} height={8} style={{ display: 'block' }}>
                      <line
                        x1={1}
                        y1={6}
                        x2={bar.px + 1}
                        y2={6}
                        stroke="var(--text-2)"
                        strokeWidth={1.5}
                      />
                      <line x1={1} y1={1} x2={1} y2={7} stroke="var(--text-2)" strokeWidth={1.5} />
                      <line
                        x1={bar.px + 1}
                        y1={1}
                        x2={bar.px + 1}
                        y2={7}
                        stroke="var(--text-2)"
                        strokeWidth={1.5}
                      />
                    </svg>
                    <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-2)' }}>
                      {bar.label}
                    </span>
                  </div>
                )
              })()}
            </>
          ) : null}
          {/* Canvas — also a drop zone for the reference image */}
          <div
            ref={canvasRef}
            className="plan-canvas min-h-0 flex-1 overflow-auto p-4"
            // Wheel zoom is wired as a native non-passive listener (see effect
            // above); a React onWheel here would be passive and couldn't
            // preventDefault. Right-drag pans, so suppress its context menu.
            onContextMenu={(e) => {
              // Always override the browser menu inside the editor.
              e.preventDefault()
              // PLAN-FURNISH: right-click cancels an armed placement (mirrors
              // the 3D `usePlacementController`'s right-click cancel) instead
              // of opening a context menu for whatever's already selected.
              if (fPlanFurnish && activeDefId) {
                useStore.getState().cancelPlacement()
                return
              }
              // A right-drag pan that actually moved swallows the menu.
              if (panDidMove.current) {
                panDidMove.current = false
                return
              }
              // Open our dynamic menu for the current selection (right-click on a
              // selection shows its operations). Furniture wins, then the primary
              // plan element. Nothing selected → no menu.
              const st = useStore.getState()
              let menuTarget: ContextTarget | null = null
              if (st.selectedItemIds.length > 0) {
                const id = st.selectedItemId ?? st.selectedItemIds[st.selectedItemIds.length - 1]
                menuTarget = { kind: 'item', id }
              } else if (st.planSelection) {
                menuTarget = { kind: st.planSelection.type, id: st.planSelection.id }
              }
              if (!menuTarget) return
              st.openContextMenu({
                x: e.clientX,
                y: e.clientY,
                target: menuTarget,
                levelId,
                itemId: menuTarget.kind === 'item' ? menuTarget.id : undefined,
              })
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault()
            }}
            onDrop={(e) => {
              if (!fTraceBackdrop) return
              const f = e.dataTransfer.files?.[0]
              if (f?.type.startsWith('image/')) {
                e.preventDefault()
                loadBackdrop(f)
              }
            }}
          >
            <svg
              ref={svgRef}
              width={W}
              height={H}
              className="plan-paper touch-none"
              style={{
                cursor: editMode === 'view' ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
                padding: 0,
                // Render at the full canvas size (overrides responsive `.plan-paper`
                // width rules) so the grid + plan aren't shrunk/clipped.
                width: W,
                height: H,
              }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <GridLines
                W={W}
                H={H}
                PX={PX}
                gridSize={gridSize}
                margin={GRID_MARGIN}
                ew={ew}
                ed={ed}
              />

              {/* Persistent ruler guides (PARITY-PLAN-GUIDES) — dashed accent
                  lines that points snap to. Click one to remove it. */}
              {fGuides && (
                <PlanGuidesLayer
                  guides={plan.guides ?? []}
                  toPx={toPx}
                  W={W}
                  H={H}
                  onRemoveGuide={a.removePlanGuide}
                />
              )}

              {/* Other storeys' walls as a dimmed underlay (SH3D "all levels"),
                so walls/stairs can be lined up between floors. Non-interactive. */}
              {showOtherLevels && <OtherLevelsUnderlay levels={otherLevels} toPx={toPx} />}

              {/* Un-roomed flag: the exact wall-enclosed outline filled red, drawn
                BENEATH the rooms so only walled-in floor with no room shows red
                (a "add a room here" cue). Clears as rooms cover it. */}
              {unroomedOutline && (
                <polygon
                  points={unroomedOutline.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
                  fill="var(--danger)"
                  fillOpacity={0.5}
                  stroke="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Rooms (active storey) */}
              <RoomsLayer
                rooms={levelPlan.rooms}
                sel={sel}
                strayRooms={strays.rooms}
                toPx={toPx}
                PX={PX}
                tool={tool}
                editMode={editMode}
                showRoomLabels={showRoomLabels}
                roomFont={roomFont}
                units={units}
                svgRef={svgRef}
                setPlanSelection={a.setPlanSelection}
                beginElementDrag={beginElementDrag}
                pointerWorld={pointerWorld}
                setMoving={setMoving}
                setMovingPolyVertex={setMovingPolyVertex}
                setMovingRoomLabel={setMovingRoomLabel}
              />
              {/* Ghost-stencil trace image: above the grid + room fills (opaque
                  `--surface-2` fills would otherwise hide it on any roomed plan)
                  but below furniture/walls/openings/dimensions/drafts, so traced
                  geometry stays crisp on top of the translucent reference. */}
              {fTraceBackdrop && backdrop && (
                <image
                  href={safeImageSrc(backdrop.url)}
                  x={toPx(backdrop.ox)}
                  y={toPx(backdrop.oz)}
                  width={backdrop.w * backdrop.mPerPx * PX}
                  height={backdrop.h * backdrop.mPerPx * PX}
                  opacity={backdrop.opacity}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Furniture footprints, multi-select box + rotate/scale ring, and
                name/price labels — the live 3D layout, top-down, filtered to the
                active storey. Hidden by default (the "Furniture" toggle); while
                hidden they render nothing, so they can't be selected/moved. */}
              {showFurniture && (
                <FurnitureLayer
                  items={levelItems}
                  getDef={getDef}
                  catalogRef={catalogRef}
                  PX={PX}
                  toPx={toPx}
                  tool={tool}
                  editMode={editMode}
                  fTilt={fTilt}
                  fPrice={fPrice}
                  labelsOn={labelsOn}
                  planLabels={planLabels}
                  selectedItemId={selectedItemId}
                  selectedItemIds={selectedItemIds}
                  beginElementDrag={beginElementDrag}
                  pointerWorld={pointerWorld}
                  setMovingItem={setMovingItem}
                  setRotatingMulti={setRotatingMulti}
                  setScalingMulti={setScalingMulti}
                />
              )}

              {/* Selected-furniture rotate handle: a ring + knob around the chosen
                footprint. Single selection only, edit mode + select tool, unlocked
                (see FurnitureRotateHandle). */}
              {showFurniture &&
                editMode === 'edit' &&
                tool === 'select' &&
                selectedItemId != null && (
                  <FurnitureRotateHandle
                    item={levelItems.find((i) => i.id === selectedItemId)}
                    getDef={getDef}
                    PX={PX}
                    toPx={toPx}
                    beginElementDrag={beginElementDrag}
                    pointerWorld={pointerWorld}
                    setRotatingItem={setRotatingItem}
                  />
                )}

              {/* Text notes (active storey) — PARITY-DIMTEXT. Click (select tool)
                to select + drag; edit/delete in the inspector. */}
              <NotesLayer
                notes={(plan.notes ?? []).filter(
                  (nt) => (nt.levelId ?? GROUND_LEVEL_ID) === levelId,
                )}
                sel={sel}
                toPx={toPx}
                tool={tool}
                beginElementDrag={beginElementDrag}
                pointerWorld={pointerWorld}
                setMovingNote={setMovingNote}
              />

              {/* Dimension lines (active storey) — PARITY-DIMTEXT. Drawn with the
                Dimension tool; click to select, delete in the inspector. */}
              <DimensionsLayer
                dimensions={(plan.dimensions ?? []).filter(
                  (d) => (d.levelId ?? GROUND_LEVEL_ID) === levelId,
                )}
                sel={sel}
                toPx={toPx}
                tool={tool}
                editMode={editMode}
                units={units}
                setMovingDimEnd={setMovingDimEnd}
              />

              {/* Polyline annotations (active storey) — PARITY-POLYLINE. Drawn
                with the Polyline tool; click to select, edit/delete in the
                inspector. Open paths can carry an end arrowhead. */}
              <PolylinesLayer
                polylines={(plan.polylines ?? []).filter(
                  (p) => (p.levelId ?? GROUND_LEVEL_ID) === levelId,
                )}
                sel={sel}
                toPx={toPx}
                tool={tool}
              />

              {/* Walls (active storey) */}
              <WallsLayer
                walls={levelPlan.walls}
                sel={sel}
                selectedWalls={selectedWalls}
                strayWalls={strays.walls}
                toPx={toPx}
                skeleton={skeleton}
                planWallMultiAdd={planWallMultiAdd}
                fCurvedWalls={fCurvedWalls}
                tool={tool}
                editMode={editMode}
                svgRef={svgRef}
                setPlanSelection={a.setPlanSelection}
                toggleWallSelection={a.toggleWallSelection}
                beginElementDrag={beginElementDrag}
                pointerWorld={pointerWorld}
                setMovingWall={setMovingWall}
                setMovingBulge={setMovingBulge}
              />

              {/* Persistent wall-length + opening-width dimensions (a staple of
                pro floor planners), gated by the "Dims" toggle. */}
              <PersistentDimensionsLayer
                show={showWallDims}
                walls={levelPlan.walls}
                openings={levelPlan.openings}
                sel={sel}
                toPx={toPx}
                PX={PX}
                units={units}
                isMobile={isMobile}
                centre={planCentrePx}
                fontPx={dimFont}
              />

              {/* Pinned dimension annotations — the same callouts shown in 3D and
                the report, so a measurement traced in either view appears here. */}
              <AnnotationsLayer annotations={annotations} toPx={toPx} PX={PX} units={units} />

              {/* 360° tour stop markers (panoTour feature, plan-based placement).
                Shown as numbered eye-shaped pins on the ground level only.
                Drag to reposition; on drag-end the IDB cache for the stop is
                evicted so the next tour view recaptures from the new spot.
                Stops on other storeys are shown without a drag handle (greyed). */}
              {fPanoTour && (
                <TourStopsLayer
                  stops={panoTourStops}
                  editMode={editMode}
                  toPx={toPx}
                  svgRef={svgRef}
                  pointerWorld={pointerWorld}
                  setMovingStop={setMovingStop}
                />
              )}

              {/* Selected-wall reshape handles: endpoint grab dots + rotation ring
                (see WallHandlesLayer). */}
              {editMode === 'edit' && tool === 'select' && sel?.type === 'wall' && (
                <WallHandlesLayer
                  wall={levelPlan.walls.find((x) => x.id === sel.id)}
                  toPx={toPx}
                  svgRef={svgRef}
                  pointerWorld={pointerWorld}
                  setMovingVertex={setMovingVertex}
                  setRotatingWall={setRotatingWall}
                />
              )}

              {/* Openings — architectural symbols (door swing / window double-line) */}
              <OpeningsLayer
                openings={levelPlan.openings}
                walls={levelPlan.walls}
                sel={sel}
                strayOpenings={strays.openings}
                toPx={toPx}
                PX={PX}
                skeleton={skeleton}
                tool={tool}
                editMode={editMode}
                setPlanSelection={a.setPlanSelection}
                beginElementDrag={beginElementDrag}
                pointerWorld={pointerWorld}
                alongWall={alongWall}
                setMovingOpening={setMovingOpening}
              />
              {/* In-progress drawing overlays — draft lines, room/marquee rects,
                polygon/polyline drafts, and the live length/size readout
                (see DraftOverlayLayer). */}
              <DraftOverlayLayer
                draft={draft}
                tool={tool}
                toPx={toPx}
                PX={PX}
                numericPreviewEnd={numericPreviewEnd}
                marquee={marquee}
                polyDraft={polyDraft}
                polylineDraft={polylineDraft}
                fWallNumericEntry={fWallNumericEntry}
                isMobile={isMobile}
                units={units}
              />
              {/* PLAN-FURNISH Phase 1 — the armed catalog def's placement
                  ghost, topmost so it's never obscured by any other layer. */}
              {fPlanFurnish && (
                <PlacementGhostLayer
                  ghostItem={planGhostItem}
                  def={planDef ?? null}
                  valid={planGhostIsValid}
                  toPx={toPx}
                />
              )}
            </svg>
          </div>

          {/* Numeric wall-entry overlay — desktop only, Wall tool, while a draft is active.
            Gated by the wallNumericEntry pro feature flag. The overlay is positioned at
            a fixed screen offset from the draft end (world → screen via SVG rect). */}
          {fWallNumericEntry &&
            !isMobile &&
            tool === 'wall' &&
            draft &&
            (() => {
              // Convert the draft end-point to screen px using the SVG's current rect.
              const effX = numericPreviewEnd ? numericPreviewEnd[0] : draft.x
              const effZ = numericPreviewEnd ? numericPreviewEnd[1] : draft.z
              const svgEl = svgRef.current
              const svgRect = svgEl?.getBoundingClientRect()
              // SVG internal coords → screen: scale by (svgRect.width / W).
              const scaleX = svgRect ? svgRect.width / W : 1
              const scaleY = svgRect ? svgRect.height / H : 1
              const screenX = svgRect ? svgRect.left + toPx(effX) * scaleX : toPx(effX)
              const screenY = svgRect ? svgRect.top + toPx(effZ) * scaleY : toPx(effZ)
              return (
                <WallNumericEntry
                  start={[draft.x0, draft.z0]}
                  end={[effX, effZ]}
                  units={units}
                  endScreenPx={[screenX, screenY]}
                  onPreview={(pt) => setNumericPreviewEnd(pt)}
                  onCommit={(pt) => {
                    const st = useStore.getState()
                    if (Math.hypot(pt[0] - draft.x0, pt[1] - draft.z0) > 0.2) {
                      const id = st.addWall(
                        { start: [draft.x0, draft.z0], end: pt, thickness: wallType },
                        levelId,
                      )
                      st.setPlanSelection({ type: 'wall', id })
                      // Chain: next segment starts from the committed endpoint.
                      setNumericPreviewEnd(null)
                      setDraft({ x0: pt[0], z0: pt[1], x: pt[0], z: pt[1] })
                    }
                  }}
                  onEscape={() => {
                    setNumericPreviewEnd(null)
                    setDraft(null)
                  }}
                />
              )
            })()}
        </div>
        {/* Inspector — edits hit the active storey's elements */}
        <PlanInspector levelId={levelId} />
      </div>
    </div>
  )
}
