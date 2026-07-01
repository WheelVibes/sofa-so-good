import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { obbCorners } from '../../collision/obb'
import { canPlace, itemFootprint } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { exitPlanEditorToScene } from '../../controls/planEditorHotkey'
import { isEditableTarget } from '../../controls/useKeyboard'
import { useFeature } from '../../features/useFeature'
import { defaultDoorSwing, doorSwing, doorSwingGeometry } from '../../floorplan/doorSwing'
import { traceBuildingOutline } from '../../floorplan/footprint'
import {
  GROUND_LEVEL_ID,
  levelAsPlan,
  levelById,
  levelOfItem,
  planLevels,
} from '../../floorplan/levels'
import { planIntegrityFlags } from '../../floorplan/planIntegrity'
import { polylinePointsAttr } from '../../floorplan/polyline'
import { roomLabelPoint, roomLabelPosition } from '../../floorplan/roomCentroid'
import { detectRoomPolygon } from '../../floorplan/roomDetect'
import { isSlopedWall, slopedWallHeights } from '../../floorplan/slopedWall'
import { snapToGuides } from '../../floorplan/snapToGuides'
import type { PlanWall } from '../../floorplan/types'
import {
  DEFAULT_PLAN_WALL_COLOR,
  planBounds,
  planRoomArea,
  planRoomPerimeter,
  planTotalArea,
  pointInRoom,
  wallLength,
} from '../../floorplan/types'
import {
  arcFromMidpoint,
  isCurvedWall,
  pointAtArcLength,
  wallArcLength,
  wallCurveMidpoint,
  wallSvgPath,
} from '../../floorplan/wallArc'
import { useCatalogGetter } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { groupResizeFactor, resizedTransform } from '../../scene/selection/resizeGizmoMath'
import {
  computeRotation,
  enclosingRadius,
  pointerAngle,
  rotatePointAround,
} from '../../scene/selection/rotateGizmoMath'
import type { ContextTarget } from '../../state/slices/featuresSlice'
import { GRID_SIZES } from '../../state/slices/uiSlice'
import { useStore } from '../../state/store'
import { formatArea, formatDims, formatLength } from '../../utils/measurement'
import { CategoryIcon } from '../catalog/CategoryIcon'
import { ColorPicker } from '../controls/ColorPicker'
import { Select } from '../controls/Select'
import { openDocs } from '../docsUrl'
import { Modal } from '../Modal'
import { evictPanoStop } from '../panorama/panoImageIdb'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
import {
  alongWall as alongWallGeo,
  nearestWall as nearestWallGeo,
  planCenter as planCenterGeo,
} from './editor/floorPlanGeometry'
import { GridLines } from './editor/GridLines'
import { LevelMenu } from './editor/LevelMenu'
import { type MarqueeItem, type MarqueeRect, marqueeSelect } from './editor/marqueeSelect'
import { PlanLibrary } from './editor/PlanLibrary'
import { PlanMenu } from './editor/PlanMenu'
import { PlanToolMenu } from './editor/PlanToolMenu'
import {
  CATEGORY_FILL,
  EXPORT_PAD,
  FIT_PAD,
  GRID_MARGIN,
  MAX_H,
  MAX_W,
  MAX_ZOOM,
  MIN_ZOOM,
  type Tool,
  ZOOM_BTN_STEP,
  ZOOM_WHEEL_SENS,
} from './editor/planConstants'
import {
  dimFontPx,
  roomFontPx,
  roomLabelDetail,
  showOpeningDim,
  showWallDim,
  wrapLabel,
} from './editor/planLabelDisplay'
import { chooseScaleBar } from './editor/scaleBar'
import { snapToWalls } from './editor/snapToWalls'
import { snapWallAngle, vertexDragTarget } from './editor/snapWallAngle'
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
import { usePlanAiWalls } from './editor/usePlanAiWalls'
import { usePlanBackdrop } from './editor/usePlanBackdrop'
import { WallDimension } from './editor/WallDimension'
import { WallNumericEntry } from './editor/WallNumericEntry'
import { exportPlanPng } from './exportPlanPng'
import { PlanInspector } from './PlanInspector'
import { PLAN_LABEL_TEXT, planLabelLines } from './planLabels'
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
  // Tour stops are only shown/editable on the ground level (stops have a
  // levelId field but the plan editor operates per-level; ground is the
  // common case and keeps the UI simple).
  const panoTourStops = useStore((s) => s.panoTourStops)

  const [tool, setTool] = useState<Tool>('select')
  const [wallType, setWallType] = useState<'internal' | 'external'>('internal')
  // Active storey (F13/ML4b): every tool, overlay and inspector edit operates
  // on this level's walls/rooms/openings. Resets to ground when the editor
  // opens or a different plan becomes active.
  const [activeLevelId, setActiveLevelId] = useState<string>(GROUND_LEVEL_ID)
  // biome-ignore lint/correctness/useExhaustiveDependencies: editing/plan.id are reset triggers.
  useEffect(() => {
    setActiveLevelId(GROUND_LEVEL_ID)
  }, [editing, plan.id])
  // A stale id (level undone/removed) degrades to ground; use the EFFECTIVE id
  // everywhere so the tab highlight and the routed actions always agree.
  const activeLevel = levelById(plan, activeLevelId)
  const levelPlan = levelAsPlan(plan, activeLevel)
  const levelId = activeLevel.id
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
  const allLevels = planLevels(plan)
  const isMultiLevel = allLevels.length > 1
  const otherLevels = allLevels.filter((l) => l.id !== levelId)
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
  // Reference photo/scan to trace over (Wave F: photo-to-plan, no ML).
  // Persisted to IDB (blob + calibration) so it survives editor close + reload.
  const { backdrop, setBackdrop, loadBackdrop, removeBackdrop } = usePlanBackdrop(editing, setTool)
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
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // Middle/right-mouse drag-to-pan: start client pos + canvas scroll at grab.
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  // Whether the current pan actually moved — used to swallow the context menu
  // that a right-drag would otherwise pop at the end of the pan.
  const panDidMove = useRef(false)
  // Touch wall tap-to-place: whether an anchor (start point) already existed when
  // the current pointer went down, so onUp can tell "placing the start" from
  // "placing the end / ending the chain".
  const wallTapHadAnchor = useRef(false)

  // Last pointer position in plan metres — where a new ruler guide is dropped
  // (PARITY-PLAN-GUIDES). Updated on every pointer move over the canvas.
  const lastPlanPtRef = useRef<[number, number]>([0, 0])
  // Exiting back to 3D (Done button / Escape) frames the selected furniture via
  // the shared `exitPlanEditorToScene`. NOTE: the `P` open/close binding lives in
  // `controls/planEditorHotkey.ts` (always mounted via App) — this component is
  // lazy-mounted only while open, so a listener here could never OPEN it.

  // Measured size of the scrollable canvas viewport, so the plan fits the REAL
  // screen on load (a fixed 940×620 assumption left the plan overflowing — and
  // needing a manual zoom-out — on small/mobile viewports). Falls back to the
  // old constants until the first measurement lands.
  const [viewport, setViewport] = useState({ w: MAX_W, h: MAX_H })
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !editing) return
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [editing])

  const [ew, ed] = planBounds(plan)
  // True plan centre = midpoint of its actual bounding box (leftmost↔rightmost,
  // topmost↔bottommost of walls + rooms), NOT ew/2,ed/2 — the plan needn't start
  // at world 0, and we want that box's middle centred in the canvas.
  const planCenter = useMemo<[number, number]>(
    () => planCenterGeo(levelPlan.walls, levelPlan.rooms, [ew / 2, ed / 2]),
    [levelPlan, ew, ed],
  )
  const planCenterRef = useRef(planCenter)
  planCenterRef.current = planCenter
  const basePX = useMemo(() => {
    // Fit to the measured viewport (minus the canvas padding) so the whole plan
    // is visible at zoom 1 on any screen size.
    const availW = Math.max(160, viewport.w - 32)
    const availH = Math.max(160, viewport.h - 32)
    const fitW = availW / (ew + FIT_PAD * 2)
    const fitH = availH / (ed + FIT_PAD * 2)
    return Math.max(16, Math.min(fitW, fitH, 80))
  }, [ew, ed, viewport.w, viewport.h])
  // User zoom (wheel/pinch or the ± buttons) multiplies the base px-per-metre;
  // every coordinate (toPx + its inverse) reads PX, so zoom stays consistent.
  const [zoom, setZoom] = useState(1)
  // Latest zoom for the native wheel listener (attached once; reads via ref so
  // we don't re-bind on every zoom change).
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // Scroll target to apply *after* the zoom re-render grows the SVG, so a
  // zoom-to-cursor keeps the point under the cursor (a rAF can fire before the
  // new size lays out and then clamps the scroll — feeling unresponsive).
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)
  const PX = basePX * zoom
  // Two-finger pinch-zoom (touch): the SVG has `touch-action: none`, so the
  // browser does no native pinch — we track the active touch points ourselves
  // and zoom around their midpoint. `touchPts` is every touch currently down on
  // the canvas; `pinch` holds the gesture baseline (start spread + zoom) while
  // two are down.
  const touchPts = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  // Zoom to `next`, keeping the world point under (clientX, clientY) fixed —
  // the shared anchored-scroll path used by wheel + pinch zoom.
  const zoomToPoint = useCallback((next: number, clientX: number, clientY: number) => {
    const el = canvasRef.current
    const cur = zoomRef.current
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    if (!el || clamped === cur) return
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const cx = el.scrollLeft + px
    const cy = el.scrollTop + py
    const r = clamped / cur
    pendingScroll.current = { left: cx * r - px, top: cy * r - py }
    setZoom(clamped)
  }, [])

  // Zoom around the viewport centre (for the ± buttons / keyboard), reusing the
  // same anchored-scroll path as wheel zoom so the view stays put.
  const zoomAroundCentre = useCallback((compute: (z: number) => number) => {
    const el = canvasRef.current
    const cur = zoomRef.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, compute(cur)))
    if (!el || next === cur) return
    const px = el.clientWidth / 2
    const py = el.clientHeight / 2
    const cx = el.scrollLeft + px
    const cy = el.scrollTop + py
    const r = next / cur
    pendingScroll.current = { left: cx * r - px, top: cy * r - py }
    setZoom(next)
  }, [])
  // Canvas is the plan plus a generous grid margin on every side (pannable via
  // the scroll container; the plan stays centred because the margin is equal).
  const W = (ew + GRID_MARGIN * 2) * PX
  const H = (ed + GRID_MARGIN * 2) * PX
  const toPx = (m: number) => (m + GRID_MARGIN) * PX
  const snap = (m: number) => (gridSize > 0 ? Math.round(m / gridSize) * gridSize : m)
  // Plan centre in screen px (dimension callouts orient away from it) + the
  // zoom/screen-scaled label fonts so overlays stay legible without dominating.
  const planCentrePx: [number, number] = [toPx(ew / 2), toPx(ed / 2)]
  const dimFont = dimFontPx(PX)
  const roomFont = roomFontPx(PX)

  // Scroll the (large, margin-padded) canvas so the plan is centred. Retries
  // each frame until the SVG has laid out at its full (inline) size — before
  // that, scrollLeft clamps to 0 (content not yet wider than the view).
  const centerRaf = useRef(0)
  const centerPlan = useCallback(
    (px: number) => {
      const el = canvasRef.current
      if (!el) return
      // Cancel any in-flight centering: on open the viewport is first measured at
      // its default size, then re-measured (ResizeObserver) at the real size —
      // without this, the first (stale-px) pass could win the race and land the
      // plan off-centre (notably too low on tall mobile viewports).
      cancelAnimationFrame(centerRaf.current)
      // Wait until the SVG has laid out at its FULL expected size, then scroll so
      // the plan's true bbox centre sits at the canvas centre. We measure the
      // SVG's real offset within the scroll content (via getBoundingClientRect +
      // current scroll) so canvas padding / any extra content can't bias it.
      const expH = (ed + GRID_MARGIN * 2) * px
      let frames = 0
      const run = () => {
        frames++
        const svg = svgRef.current
        const ready = svg ? svg.getBoundingClientRect().height >= expH - 1 : false
        if ((svg && ready) || frames > 120) {
          const cRect = el.getBoundingClientRect()
          const sRect = svg?.getBoundingClientRect()
          // Content-space offset of the SVG's top-left corner.
          const svgLeft = sRect ? sRect.left - cRect.left + el.scrollLeft : 0
          const svgTop = sRect ? sRect.top - cRect.top + el.scrollTop : 0
          const [cxW, czW] = planCenterRef.current
          el.scrollLeft = Math.max(0, svgLeft + (cxW + GRID_MARGIN) * px - el.clientWidth / 2)
          el.scrollTop = Math.max(0, svgTop + (czW + GRID_MARGIN) * px - el.clientHeight / 2)
          return
        }
        centerRaf.current = requestAnimationFrame(run)
      }
      centerRaf.current = requestAnimationFrame(run)
    },
    [ed],
  )

  // Centre the plan when the editor opens, and re-fit when the viewport scale
  // settles (first measurement) or the plan bounds change. The grid extends
  // every direction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-centre on open + scale change; PX read fresh.
  useEffect(() => {
    if (editing) centerPlan(PX)
  }, [editing, centerPlan, basePX])

  // Wheel / trackpad-pinch zoom, anchored to the cursor. Uses a NATIVE
  // non-passive listener because React's synthetic `onWheel` is passive — its
  // `preventDefault()` is ignored, so Ctrl+wheel would zoom the whole browser
  // page and plain-wheel would just scroll. Plain wheel zooms here (no modifier
  // needed) so it feels as direct and sensitive as orbit-mode dolly.
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !editing) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const cx = el.scrollLeft + px
      const cy = el.scrollTop + py
      // Normalise line/page delta modes to pixels for consistent sensitivity.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const cur = zoomRef.current
      const next = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, cur * Math.exp(-e.deltaY * unit * ZOOM_WHEEL_SENS)),
      )
      if (next === cur) return
      const r = next / cur
      // Keep the cursor's world point fixed: the content scales by r, so the
      // same point sits at cx*r and we offset by the cursor's view position.
      pendingScroll.current = { left: cx * r - px, top: cy * r - py }
      setZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [editing])

  // Apply the zoom-to-cursor scroll target after the grown SVG has laid out
  // (scrollLeft set before the content is wider than the view clamps to 0).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `zoom` is the trigger — re-apply the pending scroll after each zoom re-render.
  useLayoutEffect(() => {
    const el = canvasRef.current
    const p = pendingScroll.current
    if (el && p) {
      el.scrollLeft = p.left
      el.scrollTop = p.top
      pendingScroll.current = null
    }
  }, [zoom])

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
  }, [editing, sel, polyDraft, polylineDraft, commitPolyRoom, commitPolyline, levelId])

  if (!editing) return null

  // Raw pointer → grid-snapped world point (no wall magnetism). Split out so the
  // wall-draw path can aim the grid point onto an angle increment *before* the
  // wall snap gets the final say (grid → angle → wall-snap).
  const pointerGrid = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    const gridded: [number, number] = [snap(x / PX - GRID_MARGIN), snap(y / PX - GRID_MARGIN)]
    // Persistent ruler guides take precedence over the grid within a small
    // metric threshold (PARITY-PLAN-GUIDES), so a point lands exactly on a guide.
    if (fGuides && plan.guides?.length) return snapToGuides(gridded, plan.guides, 0.15)
    return gridded
  }

  // Raw (unsnapped) pointer → plan metres. The marquee rect tracks the cursor
  // smoothly without grid quantisation (snapping would make the selection box
  // jump in grid steps).
  const pointerPlanRaw = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return [x / PX - GRID_MARGIN, y / PX - GRID_MARGIN]
  }

  const pointerWorld = (
    e: React.PointerEvent,
    excludeWallId?: string,
    snapEdges?: boolean,
  ): [number, number] => {
    // Vertex snap (always) + edge snap (wall drawing only): connect walls cleanly
    // at corners, and let a new wall tee mid-span into an existing one. Skip the
    // wall being vertex-dragged so its own endpoints don't capture the cursor.
    return snapToWalls(pointerGrid(e), levelPlan.walls, { excludeWallId, edges: snapEdges })
  }

  // Wall-draw endpoint: grid → angle-snap (15° increments, hold Shift to bypass)
  // → wall-snap, so freehand walls land on clean directions while a join to a real
  // corner/edge still wins near existing geometry.
  const wallDrawEnd = (e: React.PointerEvent, anchor: [number, number]): [number, number] => {
    const grid = pointerGrid(e)
    const aimed = e.shiftKey ? grid : snapWallAngle(anchor, grid)
    return snapToWalls(aimed, levelPlan.walls, { edges: true })
  }

  /** Nearest active-storey wall to a world point, with the projected offset. */
  const nearestWall = (wx: number, wz: number) => nearestWallGeo(levelPlan.walls, wx, wz)

  // Along-wall distance of a world point: arc-length on a curved wall, chord
  // projection on a straight one. Used to drag an opening along its wall.
  const alongWall = (wall: PlanWall, x: number, z: number): number => alongWallGeo(wall, x, z)

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
    svgRef.current?.setPointerCapture(e.pointerId)
  }

  /**
   * Decide whether a pointer-down on a draggable element starts a MOVE. View
   * mode never moves; on touch, edit mode requires the element to already be
   * selected (tap first). When true it has captured the pointer + stopped
   * propagation; when false the caller just selects and lets the gesture bubble
   * to the canvas pan.
   */
  const beginElementDrag = (e: React.PointerEvent, isSelectedNow: boolean): boolean => {
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
      // A tap (not a drag) on the empty canvas in select mode clears the
      // selection — the desktop edit path already deselects on pointer-down via
      // the `else` in onDown; this covers view mode + touch, which pan instead.
      if (!moved && tool === 'select') {
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
      // backdrop rescales (mPerPx) to match. No walls created.
      const worldDist = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
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
            setBackdrop((b) => (b ? { ...b, mPerPx: (b.mPerPx * meters) / worldDist } : b))
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
    <div className="seg accent">
      <button
        type="button"
        className={editMode === 'view' ? 'on' : ''}
        aria-pressed={editMode === 'view'}
        onClick={() => {
          setEditMode('view')
          setTool('select')
          setPolyDraft([])
          setPolylineDraft([])
          setDraft(null)
        }}
        title="View — pan & zoom only; dragging never moves anything"
      >
        View
      </button>
      <button
        type="button"
        className={editMode === 'edit' ? 'on' : ''}
        aria-pressed={editMode === 'edit'}
        onClick={() => setEditMode('edit')}
        title="Edit — draw + move items (on touch, tap an item before dragging it)"
      >
        Edit
      </button>
    </div>
  )

  // The drawing-tool palette. Condensed so the whole bar stays ONE row: Select is
  // a pointer icon, Wall/Split are direct buttons, and the related tools collapse
  // into labelled dropdowns (Room / Opening / Markup). The mobile bar keeps its
  // single `PlanToolMenu` picker.
  const toolGroups: { label: string; tools: { t: Tool; label: string; title: string }[] }[] = [
    {
      label: 'Room',
      tools: [
        {
          t: 'room',
          label: 'Rectangle',
          title: 'Rectangular room — drag a rectangle (area is computed)',
        },
        {
          t: 'polyroom',
          label: 'Polygon',
          title:
            'Polygon room — draw an L-shaped / non-rectangular room: click each corner, then click the first corner (or press Enter) to close it. Esc cancels.',
        },
        {
          t: 'autoroom',
          label: 'Auto',
          title: 'Auto room — click inside a wall-enclosed area to make a room from it',
        },
      ],
    },
    {
      label: 'Opening',
      tools: [
        { t: 'door', label: 'Door', title: 'Door — click on a wall to add a door' },
        { t: 'window', label: 'Window', title: 'Window — click on a wall to add a window' },
      ],
    },
    {
      label: 'Markup',
      tools: [
        { t: 'text', label: 'Text', title: 'Text note — click to place a label' },
        { t: 'dimension', label: 'Dimension', title: 'Dimension line — drag between two points' },
        ...(fPolyline
          ? [
              {
                t: 'polyline' as Tool,
                label: 'Polyline',
                title:
                  'Polyline markup — click vertices, Enter to finish (open), click the first to close',
              },
            ]
          : []),
      ],
    },
  ]
  const toolPalette = (
    <div className="flex items-center gap-1" style={{ marginLeft: 4 }}>
      <div className="seg accent">
        <button
          type="button"
          onClick={() => pickTool('select')}
          className={tool === 'select' || tool === 'scale' ? 'on' : ''}
          title="Select / move — click an element to select it, drag to move"
          aria-label="Select"
          aria-pressed={tool === 'select'}
        >
          <Icon.Select width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={() => pickTool('wall')}
          className={tool === 'wall' ? 'on' : ''}
          title="Wall — drag to draw; snaps to 15° angles (hold Shift for any angle)"
        >
          Wall
        </button>
        <button
          type="button"
          onClick={() => pickTool('split')}
          className={tool === 'split' ? 'on' : ''}
          title="Split — click a wall to split it in two"
        >
          Split
        </button>
      </div>
      {toolGroups.map((g) => (
        <PlanMenu
          key={g.label}
          label={g.label}
          width={200}
          active={g.tools.some((x) => x.t === tool)}
        >
          <div className="action-grid">
            {g.tools.map((x) => (
              <button
                key={x.t}
                type="button"
                className={`act${tool === x.t ? ' on' : ''}`}
                aria-current={tool === x.t}
                title={x.title}
                onClick={() => pickTool(x.t)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </PlanMenu>
      ))}
    </div>
  )

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
    <div className="seg">
      {(['external', 'internal'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setWallType(t)}
          title="Thickness of newly-drawn walls"
          className={`capitalize${wallType === t ? ' on' : ''}`}
        >
          {t}
        </button>
      ))}
    </div>
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
      {/* Reference photo — trace walls over a floor-plan image / room scan. */}
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
      {!backdrop ? (
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
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={backdrop.opacity}
            title="Reference opacity"
            style={{ width: 70 }}
            onChange={(e) =>
              setBackdrop((b) => (b ? { ...b, opacity: Number(e.target.value) } : b))
            }
          />
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
    <div className="seg" style={{ alignItems: 'center' }}>
      <button
        type="button"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => useStore.getState().undo()}
      >
        <Icon.Undo width={16} height={16} />
      </button>
      <button
        type="button"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => useStore.getState().redo()}
      >
        <Icon.Redo width={16} height={16} />
      </button>
    </div>
  )

  // Snap-grid size + zoom — frequent but lower-priority than undo/redo.
  const gridZoom = (
    <>
      {/* Snap-grid size — finer = more precise placement. */}
      <div className="seg" style={{ alignItems: 'center', gap: 6, paddingLeft: 8 }}>
        <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Grid
        </span>
        <Select
          ariaLabel="Snap grid size"
          className="input"
          value={String(gridSize)}
          onChange={(v) => setGridSize(Number(v))}
          options={GRID_SIZES.map((g) => ({ value: String(g), label: formatLength(g, units) }))}
        />
      </div>
      <div className="seg" style={{ alignItems: 'center' }}>
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomAroundCentre((z) => z - ZOOM_BTN_STEP)}
        >
          −
        </button>
        <button
          type="button"
          title="Reset zoom & centre"
          onClick={() => {
            pendingScroll.current = null
            setZoom(1)
            requestAnimationFrame(() => centerPlan(basePX))
          }}
          style={{ minWidth: 44, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomAroundCentre((z) => z + ZOOM_BTN_STEP)}
        >
          +
        </button>
      </div>
    </>
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
    <>
      {fPlanLabels && (
        <button
          type="button"
          onClick={() => useStore.getState().cyclePlanLabels()}
          className={`btn btn-sm${labelsOn ? ' btn-accent' : ''}`}
          title="Cycle furniture labels on the plan: off → name → name + price"
          aria-pressed={labelsOn}
        >
          {PLAN_LABEL_TEXT[planLabels]}
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowRoomLabels((v) => !v)}
        className={`btn btn-sm${showRoomLabels ? ' btn-accent' : ''}`}
        title="Toggle room name + dimension labels"
        aria-pressed={showRoomLabels}
      >
        Labels
      </button>
      <button
        type="button"
        onClick={() => setShowWallDims((v) => !v)}
        className={`btn btn-sm${showWallDims ? ' btn-accent' : ''}`}
        title="Toggle wall-length labels"
        aria-pressed={showWallDims}
      >
        Dims
      </button>
      <button
        type="button"
        onClick={() => setShowFurniture((v) => !v)}
        className={`btn btn-sm${showFurniture ? ' btn-accent' : ''}`}
        title="Show furniture footprints (hidden by default so they don't get in the way of editing; hidden furniture can't be selected or moved)"
        aria-pressed={showFurniture}
      >
        Furniture
      </button>
      <button
        type="button"
        onClick={() => setSkeleton((v) => !v)}
        className={`btn btn-sm${skeleton ? ' btn-accent' : ''}`}
        title="Skeleton view — draw all walls uniformly thin to check whether they meet to enclose rooms"
        aria-pressed={skeleton}
      >
        Skeleton
      </button>
      {isMultiLevel && (
        <button
          type="button"
          onClick={() => setShowOtherLevels((v) => !v)}
          className={`btn btn-sm${showOtherLevels ? ' btn-accent' : ''}`}
          title="Show the other storeys' walls as a dimmed underlay (to line up floors)"
          aria-pressed={showOtherLevels}
        >
          All levels
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm"
        title="Download the floor plan as a PNG image"
        onClick={() => {
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
      >
        Export PNG
      </button>
    </>
  )

  const totalLabel = (
    <span
      className="panel-sub"
      style={{ textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      Total{' '}
      <b className="mono" style={{ color: 'var(--text)' }}>
        {formatArea(total, units)}
      </b>{' '}
      · {levelPlan.rooms.length} rooms
      {fIntegrity && strayCount > 0 ? (
        <b
          style={{ color: 'var(--danger)', marginLeft: 6, whiteSpace: 'nowrap' }}
          title="Stray elements (in red): a wall joined to no other wall, a room touching no other room, or a door/window off any wall. Connect them to make the apartment whole."
        >
          ⚠ {strayCount} stray
        </b>
      ) : null}
    </span>
  )

  // Plan-wide defaults (ceiling height + wall colour) — surfaced in the mobile
  // Tools modal (on desktop they live in the right-hand PlanInspector).
  const planDefaults = (
    <>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="label">Ceiling height (m)</span>
        <input
          type="number"
          step={0.05}
          min={2.2}
          value={plan.ceilingHeight}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            if (Number.isFinite(v))
              a.updateFloorPlanMeta({ ceilingHeight: Math.min(4, Math.max(2.2, v)) })
          }}
          className="input mono"
          style={{ width: 96, textAlign: 'right' }}
        />
      </label>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="label">Wall colour</span>
        <ColorPicker
          ariaLabel="Wall colour"
          value={plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR}
          onChange={(hex) => a.updateFloorPlanMeta({ wallColor: hex })}
          paletteRoomId={null}
        />
      </div>
    </>
  )

  return (
    <div className="plan-screen absolute inset-0 z-30 flex flex-col">
      {/* Header / toolbar. Desktop stays a SINGLE row (`flex-nowrap` + horizontal
          scroll fallback so it can never spill to two rows); mobile keeps its
          short wrapping bar. */}
      <div
        className={`flex items-center gap-2 px-4 py-2 ${
          isMobile ? 'flex-wrap' : 'flex-nowrap overflow-x-auto'
        }`}
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          backdropFilter: 'blur(var(--blur))',
        }}
      >
        {isMobile ? (
          <>
            {viewToggle}
            {/* The ☰ menu holds furniture/undo/grid/labels/export/etc., useful in
                both modes — so show it always (the drawing-tool picker stays
                Edit-only). */}
            <button
              type="button"
              className={`btn btn-sm${toolsMenuOpen ? ' btn-accent' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={toolsMenuOpen}
              onClick={() => setToolsMenuOpen(true)}
            >
              ☰ Menu
            </button>
            {editMode === 'edit' && (
              <PlanToolMenu tools={toolList} tool={tool} label={toolLabel} onPick={pickTool} />
            )}
            {drawHint}
            {/* Undo/redo are important enough to stay in the top bar (not buried
                in the ☰ Menu). `ml-auto` pushes them + Done to the right. */}
            <div className="ml-auto flex items-center gap-2">
              {undoRedo}
              <button
                type="button"
                onClick={exitPlanEditorToScene}
                className="btn btn-accent btn-sm"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              value={plan.name}
              onChange={(e) => a.updateFloorPlanMeta({ name: e.target.value })}
              className="input"
              style={{ width: 148, flexShrink: 0 }}
              aria-label="Plan name"
              title="Plan name"
            />
            {viewToggle}
            {editMode === 'edit' && toolPalette}
            {editMode === 'edit' && wallTypeSeg}
            {drawHint}
            {templateLibrary}
            <PlanMenu label="Plan">{fileActions}</PlanMenu>
            <div className="ml-auto flex items-center gap-2">
              {multiSelectToggle}
              {quickActions}
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
              {totalLabel}
              <button
                type="button"
                onClick={exitPlanEditorToScene}
                className="btn btn-accent btn-sm"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
      {isMobile && (
        <Modal open={toolsMenuOpen} onClose={() => setToolsMenuOpen(false)} title="Plan tools">
          {/* Grouped into labelled sections so the sheet reads as tidy settings
              rather than one dense wall of buttons. */}
          <div className="plan-tools-sheet">
            <section className="plan-tools-group">
              <div className="menu-label">Plan</div>
              <input
                value={plan.name}
                onChange={(e) => a.updateFloorPlanMeta({ name: e.target.value })}
                className="input"
                aria-label="Plan name"
              />
              {/* Floors are managed from the bottom-left LevelMenu dropdown. */}
              <div className="flex flex-wrap items-center gap-2">
                {templateLibrary}
                {fileActions}
              </div>
            </section>

            <section className="plan-tools-group">
              <div className="menu-label">View</div>
              <div className="flex flex-wrap items-center gap-2">{viewMenuActions}</div>
              {/* undo/redo live in the top bar on mobile, so only grid + zoom here. */}
              <div className="flex flex-wrap items-center gap-2">{gridZoom}</div>
            </section>

            {(wallTypeSeg || multiSelectToggle) && (
              <section className="plan-tools-group">
                <div className="menu-label">Edit</div>
                {wallTypeSeg ? (
                  <div className="flex flex-wrap items-center gap-2">{wallTypeSeg}</div>
                ) : null}
                {multiSelectToggle}
              </section>
            )}

            <section className="plan-tools-group">
              <div className="menu-label">Defaults</div>
              {planDefaults}
              {totalLabel}
            </section>

            <button
              type="button"
              className="btn btn-sm btn-block"
              onClick={() => {
                setToolsMenuOpen(false)
                openDocs()
              }}
              title="Open the user guide in a new tab"
            >
              Help — user guide ↗
            </button>
          </div>
        </Modal>
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
                  bottom: 56,
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
                      bottom: 12,
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
              {/* Reference photo/scan to trace over (behind the grid). */}
              {backdrop && (
                <image
                  href={backdrop.url}
                  x={toPx(backdrop.ox)}
                  y={toPx(backdrop.oz)}
                  width={backdrop.w * backdrop.mPerPx * PX}
                  height={backdrop.h * backdrop.mPerPx * PX}
                  opacity={backdrop.opacity}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}

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
              {fGuides &&
                (plan.guides ?? []).map((g, i) => {
                  const p = toPx(g.pos)
                  const x1 = g.axis === 'x' ? p : 0
                  const x2 = g.axis === 'x' ? p : W
                  const y1 = g.axis === 'x' ? 0 : p
                  const y2 = g.axis === 'x' ? H : p
                  return (
                    <g key={`guide-${g.axis}-${i}`} style={{ cursor: 'pointer' }}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="transparent"
                        strokeWidth={10}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          a.removePlanGuide(i)
                        }}
                      >
                        <title>Click to remove guide</title>
                      </line>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="var(--accent)"
                        strokeWidth={1}
                        strokeDasharray="6 4"
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  )
                })}

              {/* Other storeys' walls as a dimmed underlay (SH3D "all levels"),
                so walls/stairs can be lined up between floors. Non-interactive. */}
              {showOtherLevels &&
                otherLevels.flatMap((lvl) =>
                  lvl.walls
                    .filter((w) => wallLength(w) > 0)
                    .map((w) => (
                      <line
                        key={`ghost-${lvl.id}-${w.id}`}
                        x1={toPx(w.start[0])}
                        y1={toPx(w.start[1])}
                        x2={toPx(w.end[0])}
                        y2={toPx(w.end[1])}
                        stroke="var(--text-3)"
                        strokeWidth={w.thickness === 'external' ? 4 : 2.5}
                        strokeLinecap="round"
                        opacity={0.16}
                        style={{ pointerEvents: 'none' }}
                      />
                    )),
                )}

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
              {levelPlan.rooms.map((r) => {
                const isSel = sel?.type === 'room' && sel.id === r.id
                // Stray room (touches no other room) → red tint so it's obvious it
                // needs joining into the apartment.
                const stray = strays.rooms.has(r.id)
                const roomFill = isSel
                  ? 'var(--accent-soft)'
                  : stray
                    ? 'var(--danger-soft)'
                    : 'var(--surface-2)'
                const roomStroke = isSel
                  ? 'var(--accent)'
                  : stray
                    ? 'var(--danger)'
                    : 'var(--border-2)'
                return (
                  <g
                    key={r.id}
                    style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                    onPointerDown={(e) => {
                      if (tool !== 'select') return
                      const willMove = beginElementDrag(e, sel?.type === 'room' && sel.id === r.id)
                      a.setPlanSelection({ type: 'room', id: r.id })
                      if (!willMove) return
                      const [wx, wz] = pointerWorld(e)
                      setMoving({ id: r.id, gx: wx - r.origin[0], gz: wz - r.origin[1] })
                    }}
                  >
                    {r.polygon && r.polygon.length >= 3 ? (
                      <polygon
                        points={r.polygon.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
                        fill={roomFill}
                        stroke={roomStroke}
                        strokeDasharray="4 3"
                      />
                    ) : (
                      <>
                        <rect
                          x={toPx(r.origin[0])}
                          y={toPx(r.origin[1])}
                          width={r.width * PX}
                          height={r.depth * PX}
                          fill={roomFill}
                          stroke={roomStroke}
                          strokeDasharray="4 3"
                        />
                        {r.extension && (
                          <rect
                            x={toPx(r.origin[0] + r.extension.offset[0])}
                            y={toPx(r.origin[1] + r.extension.offset[1])}
                            width={r.extension.width * PX}
                            height={r.extension.depth * PX}
                            fill={roomFill}
                            stroke={roomStroke}
                            strokeDasharray="4 3"
                          />
                        )}
                      </>
                    )}
                    {/* Reshape handles: drag any vertex of a selected free-form
                      (polyroom) room. stopPropagation keeps the room-move
                      handler on the parent <g> from firing. */}
                    {editMode === 'edit' &&
                    isSel &&
                    tool === 'select' &&
                    r.polygon &&
                    r.polygon.length >= 3
                      ? [
                          // Edge-midpoint "+" handles: click to insert a vertex on
                          // that edge and immediately drag it (so a rectangle can
                          // grow an L / bay). Rendered first so vertex handles sit
                          // on top where they coincide.
                          ...(r.polygon as [number, number][]).map(([vx, vz], i) => {
                            const poly = r.polygon as [number, number][]
                            const [nx, nz] = poly[(i + 1) % poly.length]
                            const mx = (vx + nx) / 2
                            const mz = (vz + nz) / 2
                            return (
                              <circle
                                key={`pm-${r.id}-${i}`}
                                data-poly-midpoint={`${r.id}:${i}`}
                                cx={toPx(mx)}
                                cy={toPx(mz)}
                                r={3.5}
                                fill="var(--surface)"
                                stroke="var(--accent)"
                                strokeWidth={1.5}
                                style={{ cursor: 'copy' }}
                                onPointerDown={(e) => {
                                  e.stopPropagation()
                                  const next = [...poly]
                                  next.splice(i + 1, 0, [mx, mz])
                                  const { origin, width, depth } = rectFromVerts(next)
                                  a.setPlanSelection({ type: 'room', id: r.id })
                                  useStore
                                    .getState()
                                    .updateRoom(r.id, { polygon: next, origin, width, depth })
                                  setMovingPolyVertex({ id: r.id, index: i + 1 })
                                  svgRef.current?.setPointerCapture(e.pointerId)
                                }}
                              />
                            )
                          }),
                          // Vertex handles: drag to move, double-click to remove
                          // (kept ≥ 3 so the room stays a polygon).
                          ...(r.polygon as [number, number][]).map(([vx, vz], i) => (
                            <circle
                              key={`pv-${r.id}-${i}`}
                              data-poly-vertex={`${r.id}:${i}`}
                              cx={toPx(vx)}
                              cy={toPx(vz)}
                              r={5}
                              fill="var(--accent)"
                              stroke="var(--surface)"
                              strokeWidth={1.5}
                              style={{ cursor: 'grab' }}
                              onPointerDown={(e) => {
                                e.stopPropagation()
                                a.setPlanSelection({ type: 'room', id: r.id })
                                setMovingPolyVertex({ id: r.id, index: i })
                                svgRef.current?.setPointerCapture(e.pointerId)
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                const poly = r.polygon as [number, number][]
                                if (poly.length <= 3) return
                                const next = poly.filter((_, j) => j !== i)
                                const { origin, width, depth } = rectFromVerts(next)
                                useStore
                                  .getState()
                                  .updateRoom(r.id, { polygon: next, origin, width, depth })
                              }}
                            />
                          )),
                        ]
                      : null}
                    {(() => {
                      // Progressive detail by on-screen room size: full (name +
                      // area) → name only → hidden. Keeps the most important info
                      // (the name) longest as the plan zooms out / shrinks. A
                      // selected room always shows full so editing stays legible.
                      // The "Labels" View toggle hides room name + dimensions
                      // entirely (honoured even for the selected room).
                      if (!showRoomLabels) return null
                      const detail =
                        isSel && tool === 'select' ? 'full' : roomLabelDetail(planRoomArea(r), PX)
                      if (detail === 'none') return null
                      const [lx, lz] = roomLabelPosition(r)
                      const px = toPx(lx)
                      const pz = toPx(lz)
                      // Optional label rotation (radians → degrees, about the anchor)
                      // and font-size multiplier — Sweet Home 3D label angle/font.
                      const deg = r.labelAngle ? (r.labelAngle * 180) / Math.PI : 0
                      const fontPx = roomFont * (r.labelFontScale ?? 1)
                      // Wrap the name to the room's on-screen width so long names
                      // (e.g. "Household Shelter") stay inside the room; over-long
                      // words hyphenate. ~0.55·fontPx ≈ average glyph advance.
                      const roomWidthM =
                        r.polygon && r.polygon.length >= 3
                          ? Math.max(...r.polygon.map((p) => p[0])) -
                            Math.min(...r.polygon.map((p) => p[0]))
                          : r.width
                      const maxChars = Math.max(
                        4,
                        Math.floor((roomWidthM * PX * 0.92) / (fontPx * 0.55)),
                      )
                      const nameLines = wrapLabel(r.name, maxChars)
                      const lineH = fontPx + 1
                      const totalLines = nameLines.length + (detail === 'full' ? 2 : 0)
                      // Vertically centre the multi-line block on the label anchor.
                      const yTop = pz - ((totalLines - 1) * lineH) / 2
                      return (
                        <text
                          x={px}
                          y={yTop}
                          textAnchor="middle"
                          className="select-none"
                          fontSize={fontPx}
                          fill="var(--text-2)"
                          transform={deg ? `rotate(${deg} ${px} ${pz})` : undefined}
                          style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                          onPointerDown={(e) => {
                            if (tool !== 'select') return
                            const willMove = beginElementDrag(
                              e,
                              sel?.type === 'room' && sel.id === r.id,
                            )
                            a.setPlanSelection({ type: 'room', id: r.id })
                            if (!willMove) return
                            const [wx, wz] = pointerWorld(e)
                            setMovingRoomLabel({ id: r.id, gx: wx - lx, gz: wz - lz })
                          }}
                        >
                          {nameLines.map((ln, i) => (
                            <tspan key={`${ln}-${i}`} x={px} dy={i === 0 ? 0 : lineH}>
                              {ln}
                            </tspan>
                          ))}
                          {detail === 'full' && (
                            <>
                              <tspan x={px} dy={lineH + 2} fill="var(--text-3)">
                                {formatArea(planRoomArea(r), units)}
                              </tspan>
                              <tspan x={px} dy={lineH} fill="var(--text-3)">
                                {`P ${formatLength(planRoomPerimeter(r), units)}`}
                              </tspan>
                            </>
                          )}
                        </text>
                      )
                    })()}
                  </g>
                )
              })}

              {/* Furniture footprints — the live 3D layout, top-down, filtered to
                the active storey. Hidden by default (the "Furniture" toggle);
                while hidden they render nothing, so they can't be selected/moved.
                Click to select (shared with 3D); drag (select tool) to move. */}
              {showFurniture &&
                levelItems.map((it) => {
                  const def = getDef(it.defId)
                  if (!def) return null
                  const obb = itemFootprint(it, def)
                  const corners = obbCorners(obb)
                  const pts = corners.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')
                  // Tilt indicator (PARITY-TILT): a small badge on a footprint
                  // corner when the piece is pitched/rolled out of plane, so a 2D
                  // plan shows the same tilt the 3D view + inspector carry. Gated
                  // by the same `tiltFurniture` flag as the tilt controls.
                  const tilted = fTilt && !!(it.pitch || it.roll)
                  // Highlighted when it's the primary OR part of a marquee
                  // multi-selection.
                  const isSel = selectedItemId === it.id || selectedItemIds.has(it.id)
                  // Top-down category glyph centred in the footprint (PC2-PLAN-FURN-
                  // ICONS) so a layout reads at a glance. Shown only when no text
                  // label covers the centre (labels off + not selected), sized to
                  // the footprint and hidden when too small to read.
                  const cx = toPx(it.position[0])
                  const cy = toPx(it.position[1])
                  const glyphPx = Math.min(Math.min(obb.hx, obb.hz) * 2 * PX * 0.55, 22)
                  const showGlyph = !labelsOn && !isSel && glyphPx >= 9
                  return (
                    <g key={it.id}>
                      <polygon
                        data-item-id={it.id}
                        data-item-selected={isSel ? '1' : undefined}
                        points={pts}
                        fill={
                          isSel
                            ? 'var(--accent-soft)'
                            : (CATEGORY_FILL[def.category] ?? 'var(--plan-cat-others)')
                        }
                        fillOpacity={isSel ? 0.95 : 0.55}
                        stroke={isSel ? 'var(--accent)' : 'var(--border-2)'}
                        strokeWidth={isSel ? 2 : 1}
                        strokeLinejoin="round"
                        style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                        onPointerDown={(e) => {
                          if (tool !== 'select') return
                          const st = useStore.getState()
                          // Dragging an item that's part of a multi-selection moves
                          // the whole selection — so keep it; otherwise select just
                          // this one (tap to inspect/then-drag).
                          const inMulti =
                            st.selectedItemIds.length > 1 && st.selectedItemIds.includes(it.id)
                          const willMove = beginElementDrag(e, selectedItemId === it.id || inMulti)
                          if (!inMulti) st.selectItem(it.id)
                          if (!willMove) return // view / unselected-on-touch: let it pan
                          const [wx, wz] = pointerWorld(e)
                          st.pushHistory()
                          setMovingItem({
                            id: it.id,
                            gx: wx - it.position[0],
                            gz: wz - it.position[1],
                          })
                        }}
                      />
                      {showGlyph ? (
                        <g
                          transform={`translate(${cx - glyphPx / 2},${cy - glyphPx / 2})`}
                          style={{ color: 'var(--text-2)', pointerEvents: 'none' }}
                          opacity={0.7}
                        >
                          <CategoryIcon category={def.category} width={glyphPx} height={glyphPx} />
                        </g>
                      ) : null}
                      {tilted ? (
                        <g
                          transform={`translate(${toPx(corners[0][0])},${toPx(corners[0][1])})`}
                          pointerEvents="none"
                        >
                          <title>Tilted (pitch/roll)</title>
                          <circle
                            r={7}
                            fill="var(--panel)"
                            stroke="var(--accent)"
                            strokeWidth={1.5}
                          />
                          {/* Diagonal double-arrow = out-of-plane tilt. */}
                          <path
                            d="M-3.4,3.4 L3.4,-3.4 M3.4,-3.4 l-2.5,0.15 M3.4,-3.4 l-0.15,2.5 M-3.4,3.4 l2.5,-0.15 M-3.4,3.4 l0.15,-2.5"
                            stroke="var(--accent)"
                            strokeWidth={1.2}
                            fill="none"
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null}
                    </g>
                  )
                })}

              {/* Unified multi-select bounding box + rotation ring (Canva parity):
                  when 2+ furniture items are selected, one border encloses them all
                  and a ring handle rotates the whole selection about its centroid. */}
              {showFurniture &&
                (() => {
                  const selItems = levelItems.filter((i) => selectedItemIds.has(i.id))
                  if (selItems.length < 2) return null
                  let minX = Number.POSITIVE_INFINITY
                  let minZ = Number.POSITIVE_INFINITY
                  let maxX = Number.NEGATIVE_INFINITY
                  let maxZ = Number.NEGATIVE_INFINITY
                  const centers: { cx: number; cz: number; halfDiag: number }[] = []
                  for (const it of selItems) {
                    const def = getDef(it.defId)
                    if (!def) continue
                    const obb = itemFootprint(it, def)
                    let r = 0
                    for (const [x, z] of obbCorners(obb)) {
                      if (x < minX) minX = x
                      if (z < minZ) minZ = z
                      if (x > maxX) maxX = x
                      if (z > maxZ) maxZ = z
                      r = Math.max(r, Math.hypot(x - it.position[0], z - it.position[1]))
                    }
                    centers.push({ cx: it.position[0], cz: it.position[1], halfDiag: r })
                  }
                  if (!Number.isFinite(minX)) return null
                  const cwx = (minX + maxX) / 2
                  const cwz = (minZ + maxZ) / 2
                  const ringR = enclosingRadius(cwx, cwz, centers) * PX + 14
                  const cxp = toPx(cwx)
                  const cyp = toPx(cwz)
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={toPx(minX)}
                        y={toPx(minZ)}
                        width={(maxX - minX) * PX}
                        height={(maxZ - minZ) * PX}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        rx={2}
                      />
                      {tool === 'select' && editMode === 'edit' ? (
                        <>
                          <circle
                            cx={cxp}
                            cy={cyp}
                            r={ringR}
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth={1}
                            strokeOpacity={0.5}
                          />
                          <circle
                            cx={cxp}
                            cy={cyp - ringR}
                            r={7}
                            fill="var(--accent)"
                            stroke="var(--surface)"
                            strokeWidth={2}
                            style={{ cursor: 'grab', pointerEvents: 'all' }}
                            onPointerDown={(e) => {
                              if (tool !== 'select' || editMode !== 'edit') return
                              if (!beginElementDrag(e, true)) return
                              const [wx, wz] = pointerWorld(e)
                              const st = useStore.getState()
                              st.pushHistory()
                              setRotatingMulti({
                                cx: cwx,
                                cz: cwz,
                                a0: pointerAngle(cwx, cwz, wx, wz),
                                originals: st.items
                                  .filter((m) => selectedItemIds.has(m.id))
                                  .map((m) => ({
                                    id: m.id,
                                    position: [...m.position] as [number, number],
                                    rotation: m.rotation,
                                  })),
                              })
                            }}
                          />
                          {/* Corner resize handles — drag to scale the whole
                              selection about the opposite corner (uniform). */}
                          {(
                            [
                              ['nw', minX, minZ, maxX, maxZ],
                              ['ne', maxX, minZ, minX, maxZ],
                              ['se', maxX, maxZ, minX, minZ],
                              ['sw', minX, maxZ, maxX, minZ],
                            ] as const
                          ).map(([key, hxw, hzw, pxw, pzw]) => (
                            <rect
                              key={key}
                              x={toPx(hxw) - 5}
                              y={toPx(hzw) - 5}
                              width={10}
                              height={10}
                              rx={2}
                              fill="var(--surface)"
                              stroke="var(--accent)"
                              strokeWidth={2}
                              style={{
                                cursor:
                                  key === 'nw' || key === 'se' ? 'nwse-resize' : 'nesw-resize',
                                pointerEvents: 'all',
                              }}
                              onPointerDown={(e) => {
                                if (tool !== 'select' || editMode !== 'edit') return
                                if (!beginElementDrag(e, true)) return
                                const [wx, wz] = pointerWorld(e)
                                const st = useStore.getState()
                                st.pushHistory()
                                const pivot: [number, number] = [pxw, pzw]
                                setScalingMulti({
                                  pivot,
                                  grabDist: Math.max(
                                    0.05,
                                    Math.hypot(wx - pivot[0], wz - pivot[1]),
                                  ),
                                  originals: st.items
                                    .filter((m) => selectedItemIds.has(m.id))
                                    .map((m) => {
                                      const d = catalogRef.current[m.defId]
                                      const defScale =
                                        d && d.kind !== 'parametric' ? d.scale : undefined
                                      return {
                                        id: m.id,
                                        position: [...m.position] as [number, number],
                                        scale:
                                          (typeof m.props.scale === 'number'
                                            ? m.props.scale
                                            : defScale) ?? 1,
                                      }
                                    }),
                                })
                              }}
                            />
                          ))}
                        </>
                      ) : null}
                    </g>
                  )
                })()}

              {/* Furniture labels. When the Labels toggle is on (PARITY-PLANLABELS),
                every footprint shows its name (+ price); otherwise just the
                selected one, so the user can always tell what they clicked. */}
              {showFurniture &&
                (() => {
                  const labelled = labelsOn
                    ? levelItems
                    : levelItems.filter((i) => i.id === selectedItemId)
                  return labelled.map((it) => {
                    const def = getDef(it.defId)
                    const name = it.label ?? def?.name
                    if (!name) return null
                    const variant =
                      typeof it.props.variant === 'string' ? it.props.variant : undefined
                    const price = fPrice && def ? itemPrice(def, def.category, variant) : undefined
                    const lines = labelsOn ? planLabelLines(name, price, planLabels) : [name]
                    if (lines.length === 0) return null
                    const cx = toPx(it.position[0])
                    const cy = toPx(it.position[1])
                    return (
                      <text
                        key={it.id}
                        x={cx}
                        y={cy - (lines.length - 1) * 6}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="plan-item-label"
                        style={{
                          pointerEvents: 'none',
                          fontSize: 11,
                          fontWeight: 700,
                          fill: 'var(--text)',
                          paintOrder: 'stroke',
                          stroke: 'var(--surface)',
                          strokeWidth: 3,
                          strokeLinejoin: 'round',
                        }}
                      >
                        {lines.map((ln, i) => (
                          <tspan
                            key={ln}
                            x={cx}
                            dy={i === 0 ? 0 : 12}
                            fontWeight={i === 0 ? 700 : 600}
                          >
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    )
                  })
                })()}

              {/* Selected-furniture rotate handle: a ring + knob around the chosen
                footprint, mirroring the wall rotate ring's visual language. Drag
                the ring/knob to spin the piece about its centre; reuses the 3D
                gizmo's 15°-snap (hold Shift for free rotation). Single selection
                only (like the wall handle), edit mode + select tool, unlocked.
                The plan editor selects one furniture item at a time (no plan
                multi-select yet), so a single-selection handle is the right scope. */}
              {showFurniture &&
                editMode === 'edit' &&
                tool === 'select' &&
                selectedItemId != null &&
                (() => {
                  const it = levelItems.find((i) => i.id === selectedItemId)
                  if (!it || it.locked) return null
                  const def = getDef(it.defId)
                  if (!def) return null
                  const obb = itemFootprint(it, def)
                  const cx = toPx(obb.cx)
                  const cy = toPx(obb.cz)
                  // Ring clears the footprint (half-diagonal + gap), with a px floor
                  // so tiny pieces still get a grabbable ring.
                  const ringR = Math.max(Math.hypot(obb.hx, obb.hz) * PX + 16, 28)
                  // Knob at the item's facing (+Z): world facing unit = (sin, cos);
                  // both axes scale by PX into plan pixels.
                  const kx = cx + Math.sin(it.rotation) * ringR
                  const ky = cy + Math.cos(it.rotation) * ringR
                  const startRotate = (e: React.PointerEvent) => {
                    if (!beginElementDrag(e, true)) return
                    const [gx, gz] = pointerWorld(e)
                    useStore.getState().pushHistory()
                    setRotatingItem({
                      id: it.id,
                      cx: obb.cx,
                      cz: obb.cz,
                      startRot: it.rotation,
                      a0: pointerAngle(obb.cx, obb.cz, gx, gz),
                    })
                  }
                  return (
                    <g key={`rot-${it.id}`}>
                      {/* Fat transparent grab ring — generous touch target; only the
                        stroke is interactive so the interior stays click-through. */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={ringR}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        style={{ cursor: 'grab', pointerEvents: 'stroke' }}
                        onPointerDown={startRotate}
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={ringR}
                        fill="none"
                        stroke="var(--accent)"
                        strokeOpacity={0.5}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        style={{ pointerEvents: 'none' }}
                      />
                      {/* Spoke + knob at the item's facing, doubling as a heading cue. */}
                      <line
                        x1={cx}
                        y1={cy}
                        x2={kx}
                        y2={ky}
                        stroke="var(--accent)"
                        strokeOpacity={0.5}
                        strokeWidth={1.5}
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        data-rot-handle={it.id}
                        cx={kx}
                        cy={ky}
                        r={7}
                        fill="var(--surface-solid)"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={startRotate}
                      />
                    </g>
                  )
                })()}

              {/* Text notes (active storey) — PARITY-DIMTEXT. Click (select tool)
                to select + drag; edit/delete in the inspector. */}
              {(plan.notes ?? [])
                .filter((nt) => (nt.levelId ?? GROUND_LEVEL_ID) === levelId)
                .map((nt) => {
                  const selected = sel?.type === 'note' && sel.id === nt.id
                  return (
                    <text
                      key={nt.id}
                      x={toPx(nt.x)}
                      y={toPx(nt.z)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="plan-note"
                      style={{
                        cursor: tool === 'select' ? 'move' : 'crosshair',
                        fontSize: 12,
                        fontWeight: 600,
                        fill: selected ? 'var(--accent)' : 'var(--text)',
                        paintOrder: 'stroke',
                        stroke: 'var(--surface)',
                        strokeWidth: 3,
                        strokeLinejoin: 'round',
                      }}
                      onPointerDown={(e) => {
                        if (tool !== 'select') return
                        const willMove = beginElementDrag(
                          e,
                          sel?.type === 'note' && sel.id === nt.id,
                        )
                        useStore.getState().setPlanSelection({ type: 'note', id: nt.id })
                        if (!willMove) return
                        const [wx, wz] = pointerWorld(e)
                        setMovingNote({ id: nt.id, gx: wx - nt.x, gz: wz - nt.z })
                      }}
                    >
                      {nt.text}
                    </text>
                  )
                })}

              {/* Dimension lines (active storey) — PARITY-DIMTEXT. Drawn with the
                Dimension tool; click to select, delete in the inspector. */}
              {(plan.dimensions ?? [])
                .filter((d) => (d.levelId ?? GROUND_LEVEL_ID) === levelId)
                .map((d) => {
                  const selected = sel?.type === 'dim' && sel.id === d.id
                  const x1 = toPx(d.a[0])
                  const y1 = toPx(d.a[1])
                  const x2 = toPx(d.b[0])
                  const y2 = toPx(d.b[1])
                  const dx = x2 - x1
                  const dy = y2 - y1
                  const L = Math.hypot(dx, dy) || 1
                  // Perpendicular unit (px) for end ticks + label offset.
                  const px = -dy / L
                  const py = dx / L
                  const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1])
                  const stroke = selected ? 'var(--accent)' : 'var(--text-3)'
                  return (
                    <g
                      key={d.id}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        useStore.getState().setPlanSelection({ type: 'dim', id: d.id })
                      }}
                    >
                      {/* Fat invisible hit target so the thin line is easy to click. */}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={stroke}
                        strokeWidth={selected ? 2 : 1.5}
                      />
                      {/* End ticks (±6 px perpendicular). */}
                      <line
                        x1={x1 - px * 6}
                        y1={y1 - py * 6}
                        x2={x1 + px * 6}
                        y2={y1 + py * 6}
                        stroke={stroke}
                        strokeWidth={1.5}
                      />
                      <line
                        x1={x2 - px * 6}
                        y1={y2 - py * 6}
                        x2={x2 + px * 6}
                        y2={y2 + py * 6}
                        stroke={stroke}
                        strokeWidth={1.5}
                      />
                      <text
                        x={(x1 + x2) / 2 + px * 11}
                        y={(y1 + y2) / 2 + py * 11}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          pointerEvents: 'none',
                          fontSize: 11,
                          fontWeight: 700,
                          fill: 'var(--text)',
                          paintOrder: 'stroke',
                          stroke: 'var(--surface)',
                          strokeWidth: 3,
                          strokeLinejoin: 'round',
                        }}
                      >
                        {formatLength(len, units)}
                      </text>
                      {/* Draggable endpoint handles (edit mode) — drag to reshape
                          the dimension; the inspector also edits A/B + length. */}
                      {selected &&
                        tool === 'select' &&
                        editMode === 'edit' &&
                        (
                          [
                            ['a', x1, y1],
                            ['b', x2, y2],
                          ] as const
                        ).map(([which, cx, cy]) => (
                          <circle
                            key={which}
                            cx={cx}
                            cy={cy}
                            r={6}
                            fill="var(--accent)"
                            stroke="var(--surface)"
                            strokeWidth={1.5}
                            style={{ cursor: 'grab' }}
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              setMovingDimEnd({ id: d.id, which })
                            }}
                          />
                        ))}
                    </g>
                  )
                })}

              {/* Polyline annotations (active storey) — PARITY-POLYLINE. Drawn
                with the Polyline tool; click to select, edit/delete in the
                inspector. Open paths can carry an end arrowhead. */}
              {(plan.polylines ?? [])
                .filter((p) => (p.levelId ?? GROUND_LEVEL_ID) === levelId)
                .map((p) => {
                  const selected = sel?.type === 'polyline' && sel.id === p.id
                  const project = ([x, z]: [number, number]): [number, number] => [toPx(x), toPx(z)]
                  const ptsAttr = polylinePointsAttr(p.points, project)
                  const stroke = selected ? 'var(--accent)' : 'var(--text-2)'
                  const Shape = p.closed ? 'polygon' : 'polyline'
                  // Arrowhead at the final point of an open path: a small filled
                  // triangle aligned with the last segment's direction.
                  let arrowPts: string | null = null
                  if (p.arrow && !p.closed && p.points.length >= 2) {
                    const [ex, ey] = project(p.points[p.points.length - 1])
                    const [sx, sy] = project(p.points[p.points.length - 2])
                    const dx = ex - sx
                    const dy = ey - sy
                    const L = Math.hypot(dx, dy) || 1
                    const ux = dx / L
                    const uy = dy / L
                    const size = 11
                    const bx = ex - ux * size
                    const by = ey - uy * size
                    const nx = -uy
                    const ny = ux
                    arrowPts = `${ex},${ey} ${bx + nx * size * 0.45},${by + ny * size * 0.45} ${bx - nx * size * 0.45},${by - ny * size * 0.45}`
                  }
                  return (
                    <g
                      key={p.id}
                      style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                      onPointerDown={(e) => {
                        if (tool !== 'select') return
                        e.stopPropagation()
                        useStore.getState().setPlanSelection({ type: 'polyline', id: p.id })
                      }}
                    >
                      {/* Fat invisible hit target so the thin path is easy to click. */}
                      <Shape points={ptsAttr} fill="none" stroke="transparent" strokeWidth={12} />
                      <Shape
                        points={ptsAttr}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={selected ? 2.5 : 2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeDasharray={p.dashed ? '6 4' : undefined}
                      />
                      {arrowPts && <polygon points={arrowPts} fill={stroke} />}
                    </g>
                  )
                })}

              {/* Walls (active storey) */}
              {levelPlan.walls.map((w) => {
                const isSel = sel?.type === 'wall' && sel.id === w.id
                const inSel = selectedWalls.has(w.id) // primary OR a multi-select extra
                const stray = strays.walls.has(w.id) // joined to no other wall
                const d = wallSvgPath(w, toPx)
                const stroke = inSel
                  ? 'var(--accent)'
                  : stray
                    ? 'var(--danger)'
                    : w.thickness === 'external'
                      ? 'var(--plan-wall)'
                      : 'var(--text-3)'
                // Skeleton view draws every wall at one thin stroke so corner
                // connections (gaps / overlaps) are obvious regardless of thickness.
                const bodyW = skeleton ? 2 : w.thickness === 'external' ? 7 : 4
                const onWallDown = (e: React.PointerEvent) => {
                  if (tool !== 'select') return
                  // Additive select (Shift/⌘/Ctrl-click, or the touch "Select more"
                  // toggle): toggle this wall in the multi-selection and don't drag.
                  if (e.shiftKey || e.metaKey || e.ctrlKey || planWallMultiAdd) {
                    e.stopPropagation()
                    a.toggleWallSelection(w.id)
                    return
                  }
                  const willMove = beginElementDrag(e, inSel)
                  a.setPlanSelection({ type: 'wall', id: w.id })
                  if (!willMove) return // view / unselected-on-touch: let it pan
                  if (w.locked) return // locked walls select but don't move (like furniture)
                  // Drag the whole wall (endpoint handles, which stopPropagation,
                  // handle per-corner reshape instead).
                  const [wx, wz] = pointerWorld(e)
                  setMovingWall({ id: w.id, s0: [...w.start], e0: [...w.end], grab: [wx, wz] })
                }
                // Curve bulge handle: drag a selected wall's midpoint to bow it.
                const bulge =
                  editMode === 'edit' && fCurvedWalls && isSel && tool === 'select' && !w.locked
                    ? wallCurveMidpoint(w)
                    : null
                return (
                  <g key={w.id} data-wall={w.id}>
                    {/* Selected: a translucent accent halo around the wall so the
                      selection is obvious (mirrors the furniture highlight).
                      Shown for every wall in the (multi-)selection. */}
                    {inSel && (
                      <path
                        d={d}
                        fill="none"
                        stroke="var(--accent)"
                        strokeOpacity={0.35}
                        strokeWidth={bodyW + 11}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Stray wall halo (red dashed) so a disconnected wall stands
                      out even when it's not selected. */}
                    {stray && !inSel && (
                      <path
                        d={d}
                        fill="none"
                        stroke="var(--danger)"
                        strokeOpacity={0.4}
                        strokeWidth={bodyW + 8}
                        strokeDasharray="2 5"
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Fat invisible hit target so curved/thin walls are easy to grab. */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onPointerDown={onWallDown}
                      style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={bodyW}
                      strokeLinecap="round"
                      onPointerDown={onWallDown}
                      style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                    />
                    {bulge ? (
                      <circle
                        data-wall-bulge={w.id}
                        cx={toPx(bulge[0])}
                        cy={toPx(bulge[1])}
                        r={5}
                        fill="var(--accent)"
                        stroke="var(--surface)"
                        strokeWidth={1.5}
                        style={{ cursor: 'grab' }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          a.setPlanSelection({ type: 'wall', id: w.id })
                          setMovingBulge({ id: w.id })
                          svgRef.current?.setPointerCapture(e.pointerId)
                        }}
                      />
                    ) : null}
                  </g>
                )
              })}

              {/* Persistent wall-length dimensions (a staple of pro floor
                planners): a proper dimension line with extension lines +
                arrowheads spanning each wall, oriented to the plan's outside.
                Culled to walls long enough on screen to fit the callout, and the
                text font scales with zoom — so they stay legible without
                cluttering when zoomed out. */}
              {showWallDims &&
                levelPlan.walls.map((w) => {
                  const len = wallLength(w)
                  if (!showWallDim(len, PX)) return null
                  return (
                    <WallDimension
                      key={`dim-${w.id}`}
                      a={w.start}
                      b={w.end}
                      label={formatLength(len, units)}
                      toPx={toPx}
                      centre={planCentrePx}
                      fontPx={dimFont}
                      selected={sel?.type === 'wall' && sel.id === w.id}
                    />
                  )
                })}

              {/* Opening (door/window) width dimensions — same "Dims" toggle.
                Rendered as a dimension marker spanning the opening along its
                wall, matching the wall callouts. Curved walls keep a plain label
                (a straight marker can't follow the arc). */}
              {showWallDims &&
                levelPlan.openings.map((o) => {
                  const wall = levelPlan.walls.find((w) => w.id === o.wallId)
                  if (!wall) return null
                  const len = wallLength(wall)
                  if (len === 0) return null
                  // Least-important, most-numerous labels — drop when they can't
                  // fit (and sooner on mobile) to keep the plan readable.
                  if (!showOpeningDim(o.width, PX, isMobile)) return null
                  const isSel = sel?.type === 'opening' && sel.id === o.id
                  if (isCurvedWall(wall)) {
                    const p = pointAtArcLength(wall, o.offset + o.width / 2)
                    const ux = Math.sin(p.angle)
                    const uz = Math.cos(p.angle)
                    const off = o.kind === 'door' && doorSwing(o) === 'right' ? -0.32 : 0.32
                    return (
                      <text
                        key={`odim-${o.id}`}
                        x={toPx(p.x - uz * off)}
                        y={toPx(p.z + ux * off)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="plan-dim-label"
                        fill={isSel ? 'var(--accent)' : 'var(--accent-soft-text)'}
                        style={{ pointerEvents: 'none', fontSize: dimFont, fontWeight: 600 }}
                      >
                        {formatLength(o.width, units)}
                      </text>
                    )
                  }
                  const ux = (wall.end[0] - wall.start[0]) / len
                  const uz = (wall.end[1] - wall.start[1]) / len
                  return (
                    <WallDimension
                      key={`odim-${o.id}`}
                      a={[wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]}
                      b={[
                        wall.start[0] + ux * (o.offset + o.width),
                        wall.start[1] + uz * (o.offset + o.width),
                      ]}
                      label={formatLength(o.width, units)}
                      toPx={toPx}
                      centre={planCentrePx}
                      fontPx={dimFont}
                      selected={isSel}
                    />
                  )
                })}

              {/* Pinned dimension annotations — the same callouts shown in 3D and
                the report, so a measurement traced in either view appears here. */}
              {annotations.map((an) => {
                const [ax, az] = an.a
                const [bx, bz] = an.b
                if (an.shape === 'rect') {
                  const x = Math.min(ax, bx)
                  const z = Math.min(az, bz)
                  const w = Math.abs(bx - ax)
                  const h = Math.abs(bz - az)
                  if (w < 1e-3 || h < 1e-3) return null
                  return (
                    <g key={an.id} style={{ pointerEvents: 'none' }}>
                      <rect
                        x={toPx(x)}
                        y={toPx(z)}
                        width={w * PX}
                        height={h * PX}
                        fill="var(--plan-annot)"
                        fillOpacity={0.1}
                        stroke="var(--plan-annot)"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                      />
                      <text
                        x={toPx(x + w / 2)}
                        y={toPx(z + h / 2)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--plan-annot)"
                        style={{ fontSize: 11, fontWeight: 600 }}
                      >
                        {`${formatDims(w, h, units)} · ${formatArea(w * h, units)}`}
                      </text>
                    </g>
                  )
                }
                const len = Math.hypot(bx - ax, bz - az)
                if (len < 1e-3) return null
                return (
                  <g key={an.id} style={{ pointerEvents: 'none' }}>
                    <line
                      x1={toPx(ax)}
                      y1={toPx(az)}
                      x2={toPx(bx)}
                      y2={toPx(bz)}
                      stroke="var(--plan-annot)"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                    />
                    <text
                      x={toPx((ax + bx) / 2)}
                      y={toPx((az + bz) / 2) - 6}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--plan-annot)"
                      style={{ fontSize: 11, fontWeight: 600 }}
                    >
                      {formatLength(len, units)}
                    </text>
                  </g>
                )
              })}

              {/* 360° tour stop markers (panoTour feature, plan-based placement).
                Shown as numbered eye-shaped pins on the ground level only.
                Drag to reposition; on drag-end the IDB cache for the stop is
                evicted so the next tour view recaptures from the new spot.
                Stops on other storeys are shown without a drag handle (greyed). */}
              {fPanoTour &&
                panoTourStops.map((s, i) => {
                  const [sx, sz] = s.position
                  const isGround = !s.levelId
                  return (
                    <g
                      key={s.id}
                      style={{ cursor: isGround ? 'grab' : 'default' }}
                      onPointerDown={
                        isGround
                          ? (e) => {
                              if (e.button !== 0) return
                              if (editMode !== 'edit') return // view mode: let it pan
                              e.stopPropagation()
                              const [wx, wz] = pointerWorld(e)
                              setMovingStop({ id: s.id, gx: wx - sx, gz: wz - sz })
                              svgRef.current?.setPointerCapture(e.pointerId)
                            }
                          : undefined
                      }
                    >
                      {/* Outer ring */}
                      <circle
                        cx={toPx(sx)}
                        cy={toPx(sz)}
                        r={10}
                        fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
                        fillOpacity={0.18}
                        stroke={isGround ? 'var(--accent)' : 'var(--text-3)'}
                        strokeWidth={1.5}
                      />
                      {/* Inner filled dot */}
                      <circle
                        cx={toPx(sx)}
                        cy={toPx(sz)}
                        r={4}
                        fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
                      />
                      {/* Stop number */}
                      <text
                        x={toPx(sx) + 13}
                        y={toPx(sz)}
                        dominantBaseline="middle"
                        fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
                        style={{ fontSize: 10, fontWeight: 700, pointerEvents: 'none' }}
                      >
                        {i + 1}
                      </text>
                    </g>
                  )
                })}

              {/* Selected-wall handles: drag the body to move (connected corners
                follow), drag an end handle to extend/shorten that end, or drag
                the rotate handle (offset from the midpoint) to rotate. */}
              {editMode === 'edit' &&
                tool === 'select' &&
                sel?.type === 'wall' &&
                (() => {
                  const w = levelPlan.walls.find((x) => x.id === sel.id)
                  if (!w || w.locked) return null // locked: no reshape/rotate handles
                  const sx = toPx(w.start[0])
                  const sy = toPx(w.start[1])
                  const ex = toPx(w.end[0])
                  const ey = toPx(w.end[1])
                  const mpx = (sx + ex) / 2
                  const mpy = (sy + ey) / 2
                  const L = Math.hypot(ex - sx, ey - sy) || 1
                  const npx = -(ey - sy) / L
                  const npy = (ex - sx) / L
                  // Rotation ring radius — encircles the wall (like the furniture
                  // rotate gizmo), with a floor so short walls still get a grabbable ring.
                  const ringR = Math.max(L / 2 + 16, 30)
                  const startRotate = (e: React.PointerEvent) => {
                    e.stopPropagation()
                    const [gx, gz] = pointerWorld(e)
                    const cx = (w.start[0] + w.end[0]) / 2
                    const cz = (w.start[1] + w.end[1]) / 2
                    setRotatingWall({
                      id: w.id,
                      cx,
                      cz,
                      s0: [...w.start],
                      e0: [...w.end],
                      a0: Math.atan2(gz - cz, gx - cx),
                    })
                    svgRef.current?.setPointerCapture(e.pointerId)
                  }
                  return (
                    <>
                      {(['start', 'end'] as const).map((which) => {
                        const p = w[which]
                        return (
                          <circle
                            key={which}
                            cx={toPx(p[0])}
                            cy={toPx(p[1])}
                            r={6}
                            fill="var(--accent)"
                            stroke="var(--surface-solid)"
                            strokeWidth={2}
                            style={{ cursor: 'grab' }}
                            onPointerDown={(e) => {
                              e.stopPropagation()
                              setMovingVertex({ id: w.id, which })
                              svgRef.current?.setPointerCapture(e.pointerId)
                            }}
                          />
                        )
                      })}
                      {/* Rotation ring — grab anywhere on the ring (or its knob) to
                        rotate the wall about its centre, like the furniture rotate
                        gizmo. A fat transparent ring makes the stroke easy to grab;
                        `pointerEvents: 'stroke'` keeps the ring's interior
                        click-through so elements inside stay selectable. */}
                      <circle
                        cx={mpx}
                        cy={mpy}
                        r={ringR}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        style={{ cursor: 'grab', pointerEvents: 'stroke' }}
                        onPointerDown={startRotate}
                      />
                      <circle
                        cx={mpx}
                        cy={mpy}
                        r={ringR}
                        fill="none"
                        stroke="var(--accent)"
                        strokeOpacity={0.5}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        style={{ pointerEvents: 'none' }}
                      />
                      <circle
                        cx={mpx + npx * ringR}
                        cy={mpy + npy * ringR}
                        r={7}
                        fill="var(--surface-solid)"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        style={{ cursor: 'grab' }}
                        onPointerDown={startRotate}
                      />
                    </>
                  )
                })()}

              {/* Openings — architectural symbols (door swing / window double-line) */}
              {levelPlan.openings.map((o) => {
                const wall = levelPlan.walls.find((w) => w.id === o.wallId)
                if (!wall) return null
                const len = wallLength(wall)
                if (len === 0) return null
                // Jamb endpoints + wall normal — arc-aware for curved walls.
                let nx: number
                let nz: number
                let sPt: [number, number]
                let ePt: [number, number]
                if (isCurvedWall(wall)) {
                  const a0 = pointAtArcLength(wall, o.offset)
                  const a1 = pointAtArcLength(wall, o.offset + o.width)
                  const m = pointAtArcLength(wall, o.offset + o.width / 2)
                  nx = -Math.cos(m.angle)
                  nz = Math.sin(m.angle)
                  sPt = [a0.x, a0.z]
                  ePt = [a1.x, a1.z]
                } else {
                  const ux = (wall.end[0] - wall.start[0]) / len
                  const uz = (wall.end[1] - wall.start[1]) / len
                  nx = -uz
                  nz = ux
                  sPt = [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]
                  ePt = [
                    wall.start[0] + ux * (o.offset + o.width),
                    wall.start[1] + uz * (o.offset + o.width),
                  ]
                }
                const isSel = sel?.type === 'opening' && sel.id === o.id
                // Stray opening (sitting off its wall's span) → red so it's flagged.
                const color = isSel
                  ? 'var(--accent)'
                  : strays.openings.has(o.id)
                    ? 'var(--danger)'
                    : o.kind === 'door'
                      ? 'var(--accent)'
                      : 'var(--accent-soft-text)'
                const strokeW = skeleton ? 2 : wall.thickness === 'external' ? 7 : 4
                const onPD = (e: React.PointerEvent) => {
                  if (tool !== 'select') return
                  const willMove = beginElementDrag(e, isSel)
                  a.setPlanSelection({ type: 'opening', id: o.id })
                  if (!willMove) return // view / unselected-on-touch: let it pan
                  if (o.locked) return // locked openings select but don't move
                  // Start dragging the opening along its wall.
                  const [wx, wz] = pointerWorld(e)
                  useStore.getState().pushHistory()
                  setMovingOpening({ id: o.id, grab: alongWall(wall, wx, wz) - o.offset })
                }
                return (
                  <g
                    key={o.id}
                    data-opening={o.id}
                    onPointerDown={onPD}
                    style={{ cursor: editMode === 'edit' && !o.locked ? 'grab' : 'pointer' }}
                  >
                    {/* Selected: translucent accent halo over the opening span so
                      the selection is obvious (mirrors the furniture highlight). */}
                    {isSel && (
                      <line
                        x1={toPx(sPt[0])}
                        y1={toPx(sPt[1])}
                        x2={toPx(ePt[0])}
                        y2={toPx(ePt[1])}
                        stroke="var(--accent)"
                        strokeOpacity={0.4}
                        strokeWidth={strokeW + 11}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* Fat invisible hit target along the opening span so the whole
                      door/window is easy to grab (drag it along the wall), not
                      just its thin symbol lines. */}
                    <line
                      x1={toPx(sPt[0])}
                      y1={toPx(sPt[1])}
                      x2={toPx(ePt[0])}
                      y2={toPx(ePt[1])}
                      stroke="transparent"
                      strokeWidth={Math.max(16, strokeW + 10)}
                      strokeLinecap="round"
                    />
                    {/* Mask the wall under the opening */}
                    <line
                      x1={toPx(sPt[0])}
                      y1={toPx(sPt[1])}
                      x2={toPx(ePt[0])}
                      y2={toPx(ePt[1])}
                      stroke="var(--surface-solid)"
                      strokeWidth={strokeW + 2}
                      strokeLinecap="butt"
                      style={{ pointerEvents: 'none' }}
                    />
                    {o.kind === 'door' ? (
                      (() => {
                        // Leaf line (hinge → open tip) + swing arc, honouring the
                        // door's configured hinge jamb + swing side.
                        const g = doorSwingGeometry(wall, o)
                        if (!g) return null
                        return (
                          <>
                            <line
                              x1={toPx(g.hinge[0])}
                              y1={toPx(g.hinge[1])}
                              x2={toPx(g.leafTip[0])}
                              y2={toPx(g.leafTip[1])}
                              stroke={color}
                              strokeWidth={isSel ? 3 : 2}
                            />
                            <path
                              d={`M ${toPx(g.freeJamb[0])} ${toPx(g.freeJamb[1])} A ${o.width * PX} ${o.width * PX} 0 0 ${g.sweep} ${toPx(g.leafTip[0])} ${toPx(g.leafTip[1])}`}
                              fill="none"
                              stroke={color}
                              strokeWidth={1}
                              opacity={0.7}
                            />
                          </>
                        )
                      })()
                    ) : (
                      <>
                        {/* Window double line across the opening */}
                        {[-1, 1].map((s) => (
                          <line
                            key={s}
                            x1={toPx(sPt[0] + nx * 0.04 * s)}
                            y1={toPx(sPt[1] + nz * 0.04 * s)}
                            x2={toPx(ePt[0] + nx * 0.04 * s)}
                            y2={toPx(ePt[1] + nz * 0.04 * s)}
                            stroke={color}
                            strokeWidth={isSel ? 2.5 : 1.5}
                          />
                        ))}
                      </>
                    )}
                  </g>
                )
              })}

              {/* Scale calibration / dimension draft line */}
              {draft && (tool === 'scale' || tool === 'dimension') && (
                <line
                  x1={toPx(draft.x0)}
                  y1={toPx(draft.z0)}
                  x2={toPx(draft.x)}
                  y2={toPx(draft.z)}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}

              {/* Draft (in-progress draw) */}
              {draft &&
                tool === 'wall' &&
                (() => {
                  // When the user is typing in the numeric overlay, preview uses
                  // that endpoint; otherwise the live drag position.
                  const effX = numericPreviewEnd ? numericPreviewEnd[0] : draft.x
                  const effZ = numericPreviewEnd ? numericPreviewEnd[1] : draft.z
                  return (
                    <>
                      <line
                        x1={toPx(draft.x0)}
                        y1={toPx(draft.z0)}
                        x2={toPx(effX)}
                        y2={toPx(effZ)}
                        stroke="var(--accent)"
                        strokeWidth={4}
                        strokeLinecap="round"
                      />
                      {/* Snap markers at the exact (grid/wall-snapped) endpoints, so the
                      point you're placing is visible even under a fingertip. The
                      filled dot is the start/anchor; the ring is the live end. */}
                      <circle cx={toPx(draft.x0)} cy={toPx(draft.z0)} r={5} fill="var(--accent)" />
                      <circle
                        cx={toPx(effX)}
                        cy={toPx(effZ)}
                        r={5}
                        fill="var(--surface-solid)"
                        stroke="var(--accent)"
                        strokeWidth={2}
                      />
                    </>
                  )
                })()}
              {draft && tool === 'room' && (
                <rect
                  x={toPx(Math.min(draft.x0, draft.x))}
                  y={toPx(Math.min(draft.z0, draft.z))}
                  width={Math.abs(draft.x - draft.x0) * PX}
                  height={Math.abs(draft.z - draft.z0) * PX}
                  fill="var(--accent-soft)"
                  stroke="var(--accent)"
                />
              )}
              {/* Rubber-band marquee (PARITY-PLAN-MARQUEE): a dashed accent box
                while dragging on empty canvas; on release everything it crosses
                is multi-selected. Pointer-transparent so it can't intercept the
                drag it's tracking. */}
              {marquee && (
                <rect
                  x={toPx(Math.min(marquee.x0, marquee.x1))}
                  y={toPx(Math.min(marquee.z0, marquee.z1))}
                  width={Math.abs(marquee.x1 - marquee.x0) * PX}
                  height={Math.abs(marquee.z1 - marquee.z0) * PX}
                  fill="var(--accent-soft)"
                  fillOpacity={0.25}
                  stroke="var(--accent)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* In-progress polygon room: placed edges + vertices; the first
                vertex is ringed (click it, or press Enter, to close). */}
              {tool === 'polyroom' && polyDraft.length > 0 && (
                <g>
                  <polyline
                    points={polyDraft.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                  {polyDraft.map(([x, z], i) => (
                    <circle
                      key={i}
                      cx={toPx(x)}
                      cy={toPx(z)}
                      r={i === 0 ? 6 : 4}
                      fill={i === 0 ? 'none' : 'var(--accent)'}
                      stroke="var(--accent)"
                      strokeWidth={i === 0 ? 2 : 0}
                    />
                  ))}
                </g>
              )}
              {/* In-progress polyline markup: placed edges + vertices; the first
                vertex is ringed (click it to close, or press Enter to finish
                as an open path). */}
              {tool === 'polyline' && polylineDraft.length > 0 && (
                <g>
                  <polyline
                    points={polylineDraft.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {polylineDraft.map(([x, z], i) => (
                    <circle
                      key={i}
                      cx={toPx(x)}
                      cy={toPx(z)}
                      r={i === 0 ? 6 : 4}
                      fill={i === 0 ? 'none' : 'var(--accent)'}
                      stroke="var(--accent)"
                      strokeWidth={i === 0 ? 2 : 0}
                    />
                  ))}
                </g>
              )}
              {/* Live dimension readout while drawing — follows the cursor with a
                readable halo so you always know the current length/size.
                When numeric-entry is active, the overlay shows the numbers; this
                SVG readout is suppressed to avoid duplication. */}
              {draft && !(tool === 'wall' && fWallNumericEntry && !isMobile) && (
                <text
                  x={toPx(draft.x) + 10}
                  y={toPx(draft.z) - 10}
                  fontSize={13}
                  fontWeight={700}
                  fill="var(--accent)"
                  className="select-none"
                  style={{ paintOrder: 'stroke', stroke: 'var(--surface-solid)', strokeWidth: 4 }}
                >
                  {tool === 'wall'
                    ? (() => {
                        const len = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
                        // Angle CCW from east, with +Z (screen-down) shown as a
                        // downward bearing — negate dz so 0° is east, 90° is north.
                        const raw = Math.round(
                          (Math.atan2(-(draft.z - draft.z0), draft.x - draft.x0) * 180) / Math.PI,
                        )
                        const deg = ((raw % 360) + 360) % 360
                        return `${formatLength(len, units)}  ${deg}°`
                      })()
                    : `${formatLength(Math.abs(draft.x - draft.x0), units)} × ${formatLength(Math.abs(draft.z - draft.z0), units)}  (${formatArea(Math.abs(draft.x - draft.x0) * Math.abs(draft.z - draft.z0), units)})`}
                </text>
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

/** Save / load / delete named apartments (the plan library). */
