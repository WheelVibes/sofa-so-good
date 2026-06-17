import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AiPlanError,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  recognizeFloorPlan,
  setVisionKey,
} from '../../ai/floorPlanAi'
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
import { polylinePointsAttr } from '../../floorplan/polyline'
import { roomLabelPoint, roomLabelPosition } from '../../floorplan/roomCentroid'
import { detectRoomPolygon } from '../../floorplan/roomDetect'
import { isSlopedWall } from '../../floorplan/slopedWall'
import type { PlanWall } from '../../floorplan/types'
import {
  DEFAULT_PLAN_WALL_COLOR,
  planBounds,
  planRoomArea,
  planTotalArea,
  wallLength,
} from '../../floorplan/types'
import {
  arcFromMidpoint,
  isCurvedWall,
  nearestArcLength,
  pointAtArcLength,
  wallArcLength,
  wallCurveMidpoint,
  wallSvgPath,
} from '../../floorplan/wallArc'
import { useCatalogGetter } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { GRID_SIZES } from '../../state/slices/uiSlice'
import { useStore } from '../../state/store'
import { formatArea, formatDims, formatLength } from '../../utils/measurement'
import { openDocs } from '../docsUrl'
import { Modal } from '../Modal'
import { evictPanoStop } from '../panorama/panoImageIdb'
import { useIsMobile } from '../useIsMobile'
import {
  type BackdropMeta,
  persistBackdrop,
  readPersistedBackdrop,
  removePersistedBackdrop,
  updateBackdropMeta,
} from './backdropPersist'
import { GridLines } from './editor/GridLines'
import { PlanLibrary } from './editor/PlanLibrary'
import { PlanMenu } from './editor/PlanMenu'
import {
  type Backdrop,
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
import { snapToWalls } from './editor/snapToWalls'
import { WallDimension } from './editor/WallDimension'
import { exportPlanPng } from './exportPlanPng'
import { LevelTabs } from './LevelTabs'
import { PlanInspector } from './PlanInspector'
import { PLAN_LABEL_TEXT, planLabelLines } from './planLabels'
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
  const annotations = useStore((s) => s.annotations)
  const { getDef, ref: catalogRef } = useCatalogGetter()
  // Mobile: the toolbar is too cluttered to fit, so secondary controls + the
  // plan defaults collapse behind a single "Tools" menu (parity with the
  // per-room editor's collapsed mobile toolbar).
  const isMobile = useIsMobile()
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const fPanoTour = useFeature('panoTour')
  const fCurvedWalls = useFeature('curvedWalls')
  const fCompass = useFeature('planCompass')
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
  const allLevels = planLevels(plan)
  const isMultiLevel = allLevels.length > 1
  const otherLevels = allLevels.filter((l) => l.id !== levelId)
  const [draft, setDraft] = useState<{ x0: number; z0: number; x: number; z: number } | null>(null)
  // Active room drag (select tool): grab offset from the room origin.
  const [moving, setMoving] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active furniture drag (select tool): grab offset from the item position.
  const [movingItem, setMovingItem] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active wall-vertex drag (select tool): which wall endpoint is being moved.
  const [movingVertex, setMovingVertex] = useState<{ id: string; which: 'start' | 'end' } | null>(
    null,
  )
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
  // Reference photo/scan to trace over (Wave F: photo-to-plan, no ML).
  // Persisted to IDB (blob + calibration) so it survives editor close + reload.
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const aiWalls = useFeature('aiWalls')
  // Persistent wall-length labels (on by default; toggle in the editor header).
  // Dimensions default OFF — they're the densest overlay and collide with walls
  // when zoomed out; the toolbar "Dims" toggle turns them on. When on, callouts
  // are culled + font-scaled by zoom/screen so they stay legible (see below).
  const [showWallDims, setShowWallDims] = useState(false)
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

  // Rehydrate a previously-saved backdrop when the editor opens (the component
  // is always mounted and only renders when `editing`, so this can't be a
  // once-on-mount effect). Skips if one is already loaded so reopening doesn't
  // create a duplicate object URL.
  const backdropUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!editing) return
    let cancelled = false
    void readPersistedBackdrop().then((p) => {
      if (cancelled || !p) return
      setBackdrop((prev) => {
        if (prev) return prev
        const url = URL.createObjectURL(p.blob)
        backdropUrlRef.current = url
        return { url, ...p.meta }
      })
    })
    return () => {
      cancelled = true
    }
  }, [editing])

  // Revoke the live object URL only on a true unmount (not on editor close).
  useEffect(
    () => () => {
      if (backdropUrlRef.current) URL.revokeObjectURL(backdropUrlRef.current)
    },
    [],
  )

  // Persist calibration changes (opacity/scale/offset) without rewriting the
  // blob, debounced so a slider/drag doesn't hammer IDB.
  useEffect(() => {
    if (!backdrop) return
    const meta: BackdropMeta = {
      w: backdrop.w,
      h: backdrop.h,
      opacity: backdrop.opacity,
      mPerPx: backdrop.mPerPx,
      ox: backdrop.ox,
      oz: backdrop.oz,
    }
    const t = setTimeout(() => void updateBackdropMeta(meta), 400)
    return () => clearTimeout(t)
  }, [backdrop])

  // Experimental AI wall recognition (Wave E): send the backdrop to a vision
  // model and seed an editable draft plan from the returned walls. Falls back
  // to manual tracing on any failure.
  const runAiWalls = async () => {
    if (!backdrop || aiBusy) return
    let key = getVisionKey()
    if (!key) {
      key =
        (await useStore.getState().promptText({
          title: 'AI floor-plan recognition',
          label: 'Vision-model API key (OpenAI-compatible, kept in this browser)',
          submitLabel: 'Continue',
        })) || ''
      if (!key) return
      setVisionKey(key)
    }
    // Security gate: warn (and require explicit confirmation) before the bearer
    // key is sent to anything other than a recognised provider. A plaintext
    // endpoint is refused outright downstream in recognizeFloorPlan.
    const endpoint = classifyVisionEndpoint(getVisionUrl())
    if (!endpoint.secure) {
      useStore
        .getState()
        .notify.start({ title: 'Insecure AI endpoint', message: endpoint.reason, kind: 'error' })
      return
    }
    if (!endpoint.trusted) {
      const ok = await useStore.getState().promptText({
        title: 'Send your API key to this server?',
        label: `${endpoint.reason} Type the host name (${endpoint.host}) to confirm.`,
        submitLabel: 'Send',
      })
      if ((ok || '').trim().toLowerCase() !== endpoint.host.toLowerCase()) {
        useStore.getState().notify.start({ title: 'AI recognition cancelled', kind: 'info' })
        return
      }
    }
    setAiBusy(true)
    try {
      // The backdrop is an object URL; the remote model needs inline data.
      const img = new Image()
      img.src = backdrop.url
      await img.decode().catch(() => {})
      const c = document.createElement('canvas')
      c.width = backdrop.w
      c.height = backdrop.h
      c.getContext('2d')?.drawImage(img, 0, 0)
      const walls = await recognizeFloorPlan(c.toDataURL('image/png'), { key })
      const st = useStore.getState()
      st.pushHistory()
      st.newFloorPlan('AI draft')
      for (const w of walls) {
        st.addWall({
          start: [w.x1, w.z1],
          end: [w.x2, w.z2],
          thickness: w.external ? 'external' : 'internal',
        })
      }
      st.notify.start({
        title: `AI drafted ${walls.length} walls — adjust as needed`,
        kind: 'success',
      })
    } catch (e) {
      useStore.getState().notify.start({
        title: e instanceof AiPlanError ? e.message : 'AI floor-plan recognition failed.',
        kind: 'error',
      })
    } finally {
      setAiBusy(false)
    }
  }

  // Load a dropped/picked image as the trace backdrop (defaults to ~100 px/m;
  // the user calibrates exactly with the Scale tool).
  const loadBackdrop = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const meta: BackdropMeta = {
        w: img.naturalWidth,
        h: img.naturalHeight,
        opacity: 0.5,
        mPerPx: 0.01,
        ox: 0,
        oz: 0,
      }
      setBackdrop((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, ...meta }
      })
      backdropUrlRef.current = url
      // Persist the blob + calibration so the backdrop survives reload/reopen.
      void persistBackdrop(file, meta)
      setTool('select')
    }
    img.src = url
  }

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
  const planCenter = useMemo<[number, number]>(() => {
    let minX = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    const acc = (x: number, z: number) => {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    for (const w of levelPlan.walls) {
      acc(w.start[0], w.start[1])
      acc(w.end[0], w.end[1])
    }
    for (const r of levelPlan.rooms) {
      if (r.polygon && r.polygon.length >= 3) for (const [x, z] of r.polygon) acc(x, z)
      else {
        acc(r.origin[0], r.origin[1])
        acc(r.origin[0] + r.width, r.origin[1] + r.depth)
      }
    }
    return Number.isFinite(minX) ? [(minX + maxX) / 2, (minZ + maxZ) / 2] : [ew / 2, ed / 2]
  }, [levelPlan, ew, ed])
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
      const xs = verts.map((v) => v[0])
      const zs = verts.map((v) => v[1])
      const x0 = Math.min(...xs)
      const z0 = Math.min(...zs)
      const st = useStore.getState()
      const n = levelById(st.floorPlan, levelId).rooms.length + 1
      const id = st.addRoom(
        {
          name: `Room ${n}`,
          origin: [x0, z0],
          width: Math.max(0.1, Math.max(...xs) - x0),
          depth: Math.max(0.1, Math.max(...zs) - z0),
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
        if (polylineDraft.length > 0) {
          setPolylineDraft([])
          return
        }
        if (polyDraft.length > 0) {
          setPolyDraft([])
          return
        }
        setDraft(null)
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
        } else if (st.selectedItemId) {
          // A furniture footprint is selected — delete it (parity with 3D).
          st.deleteItem(st.selectedItemId)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, sel, polyDraft, polylineDraft, commitPolyRoom, commitPolyline, levelId])

  if (!editing) return null

  const pointerWorld = (
    e: React.PointerEvent,
    excludeWallId?: string,
    snapEdges?: boolean,
  ): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    const wx = snap(x / PX - GRID_MARGIN)
    const wz = snap(y / PX - GRID_MARGIN)
    // Vertex snap (always) + edge snap (wall drawing only): connect walls cleanly
    // at corners, and let a new wall tee mid-span into an existing one. Skip the
    // wall being vertex-dragged so its own endpoints don't capture the cursor.
    return snapToWalls([wx, wz], levelPlan.walls, { excludeWallId, edges: snapEdges })
  }

  /** Nearest active-storey wall to a world point, with the projected offset. */
  const nearestWall = (
    wx: number,
    wz: number,
  ): { wall: PlanWall; offset: number; dist: number } | null => {
    let best: { wall: PlanWall; offset: number; dist: number } | null = null
    for (const wall of levelPlan.walls) {
      // Curved walls: measure against the arc (distance + arc-length offset) so a
      // click on the bulged span is detected and the opening lands at the right
      // arc position; straight walls use the chord projection.
      if (isCurvedWall(wall)) {
        const { offset, dist } = nearestArcLength(wall, [wx, wz])
        if (!best || dist < best.dist) best = { wall, offset, dist }
        continue
      }
      const dx = wall.end[0] - wall.start[0]
      const dz = wall.end[1] - wall.start[1]
      const len = Math.hypot(dx, dz)
      if (len === 0) continue
      const t = ((wx - wall.start[0]) * dx + (wz - wall.start[1]) * dz) / (len * len)
      const ct = Math.max(0, Math.min(1, t))
      const px = wall.start[0] + ct * dx
      const pz = wall.start[1] + ct * dz
      const dist = Math.hypot(wx - px, wz - pz)
      if (!best || dist < best.dist) best = { wall, offset: ct * len, dist }
    }
    return best && best.dist < 0.4 ? best : null
  }

  // Along-wall distance of a world point: arc-length on a curved wall, chord
  // projection on a straight one. Used to drag an opening along its wall.
  const alongWall = (wall: PlanWall, x: number, z: number): number => {
    if (isCurvedWall(wall)) return nearestArcLength(wall, [x, z]).offset
    const len = wallLength(wall)
    if (len === 0) return 0
    const ux = (wall.end[0] - wall.start[0]) / len
    const uz = (wall.end[1] - wall.start[1]) / len
    return (x - wall.start[0]) * ux + (z - wall.start[1]) * uz
  }

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
    svgRef.current?.setPointerCapture(e.pointerId)
    return true
  }

  const onDown = (e: React.PointerEvent) => {
    // Middle- OR right-button drags pan the open canvas (orbit-style: a drag
    // moves the view, leaving the left button free to draw/select). The right
    // button's context menu is suppressed in onContextMenu when a pan moved.
    if ((e.button === 1 || e.button === 2) && canvasRef.current) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    // View mode (any drag pans), or a mobile-edit select-tool drag — on empty
    // canvas, or an unselected item whose handler fell through here — pans
    // instead of editing. The selected item's handler captures before this runs.
    if (editMode === 'view' || (isMobile && tool === 'select')) {
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
      setDraft(draft ? { ...draft, x: wx, z: wz } : { x0: wx, z0: wz, x: wx, z: wz })
    } else if (tool === 'wall' || tool === 'room' || tool === 'scale' || tool === 'dimension') {
      setDraft({ x0: wx, z0: wz, x: wx, z: wz })
    } else if (tool === 'autoroom') {
      // Make a room from the active storey's wall loop enclosing the click.
      const poly = detectRoomPolygon(levelById(st.floorPlan, levelId).walls, [wx, wz])
      if (poly) commitPolyRoom(poly)
      else
        st.notify.start({
          title: 'No enclosing walls here — draw a closed wall loop first',
          kind: 'info',
        })
    } else if (tool === 'polyroom') {
      // Click near the first vertex (≥3 placed) closes the polygon into a room.
      const first = polyDraft[0]
      if (first && polyDraft.length >= 3 && Math.hypot(first[0] - wx, first[1] - wz) < 0.35) {
        commitPolyRoom(polyDraft)
        setPolyDraft([])
      } else {
        setPolyDraft((p) => [...p, [wx, wz]])
      }
    } else if (tool === 'polyline') {
      // Click adds a vertex; clicking the first vertex (≥3) closes the loop;
      // Enter finishes as an open path, Escape cancels (PARITY-POLYLINE).
      const first = polylineDraft[0]
      if (first && polylineDraft.length >= 3 && Math.hypot(first[0] - wx, first[1] - wz) < 0.35) {
        commitPolyline(polylineDraft, true)
        setPolylineDraft([])
      } else {
        setPolylineDraft((p) => [...p, [wx, wz]])
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
      if (hit && isSlopedWall(hit.wall)) {
        // Sloped walls are a solid prism — they can't host openings.
        st.notify.start({
          title: 'Sloped walls can’t have doors or windows yet',
          kind: 'info',
          autoDismissMs: 3000,
        })
      } else if (hit) {
        const width = tool === 'door' ? 0.9 : 1.2
        // Offsets are arc-length on a curved wall, chord length on a straight one.
        const wlen = isCurvedWall(hit.wall) ? wallArcLength(hit.wall) : wallLength(hit.wall)
        const offset = Math.max(0, Math.min(wlen - width, hit.offset - width / 2))
        const snapped = snap(offset)
        const id = st.addOpening(
          {
            kind: tool,
            wallId: hit.wall.id,
            offset: snapped,
            width,
            sill: tool === 'door' ? 0 : 0.95,
            head: tool === 'door' ? 2.1 : 2.1,
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
      st.setPlanSelection(null)
    }
  }

  const onMove = (e: React.PointerEvent) => {
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
      useStore.getState().moveWallVertex(movingVertex.id, movingVertex.which, [wx, wz], levelId)
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
      const ang = Math.atan2(wz - rotatingWall.cz, wx - rotatingWall.cx)
      // Wrap to (-π, π], then clamp to ±90° each way: a larger turn would swing
      // a segment back across its neighbours and tangle the shared corners.
      let d = ang - rotatingWall.a0
      d = Math.atan2(Math.sin(d), Math.cos(d))
      d = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d))
      const cos = Math.cos(d)
      const sin = Math.sin(d)
      const rot = (p: [number, number]): [number, number] => {
        const x = p[0] - rotatingWall.cx
        const z = p[1] - rotatingWall.cz
        return [
          snap(rotatingWall.cx + x * cos - z * sin),
          snap(rotatingWall.cz + x * sin + z * cos),
        ]
      }
      useStore
        .getState()
        .moveWallTo(rotatingWall.id, rot(rotatingWall.s0), rot(rotatingWall.e0), levelId)
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
        const xs = poly.map((p) => p[0])
        const zs = poly.map((p) => p[1])
        const x0 = Math.min(...xs)
        const z0 = Math.min(...zs)
        st.updateRoom(room.id, {
          polygon: poly,
          origin: [x0, z0],
          width: Math.max(0.1, Math.max(...xs) - x0),
          depth: Math.max(0.1, Math.max(...zs) - z0),
        })
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
      useStore
        .getState()
        .updateRoom(moving.id, { origin: [snap(wx - moving.gx), snap(wz - moving.gz)] })
      return
    }
    if (!draft) return
    const [wx, wz] = pointerWorld(e, undefined, tool === 'wall')
    setDraft({ ...draft, x: wx, z: wz })
  }

  const onUp = () => {
    if (panRef.current) {
      panRef.current = null
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
    if (!draft) return
    const st = useStore.getState()
    if (tool === 'scale') {
      // Calibrate: the dragged span equals a real length the user types, so the
      // backdrop rescales (mPerPx) to match. No walls created.
      const worldDist = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
      if (backdrop && worldDist > 0.05) {
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
      if (Math.hypot(draft.x - draft.x0, draft.z - draft.z0) > 0.1) {
        const id = st.addDimension({
          a: [snap(draft.x0), snap(draft.z0)],
          b: [snap(draft.x), snap(draft.z)],
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
      const len = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
      if (len > 0.2) {
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
      if (Math.hypot(draft.x - draft.x0, draft.z - draft.z0) > 0.2) {
        const id = st.addWall(
          {
            start: [draft.x0, draft.z0],
            end: [draft.x, draft.z],
            thickness: wallType,
          },
          levelId,
        )
        st.setPlanSelection({ type: 'wall', id })
      }
    } else if (tool === 'room') {
      const x = Math.min(draft.x0, draft.x)
      const z = Math.min(draft.z0, draft.z)
      const w = Math.abs(draft.x - draft.x0)
      const d = Math.abs(draft.z - draft.z0)
      if (w > 0.3 && d > 0.3) {
        const n = levelById(st.floorPlan, levelId).rooms.length + 1
        const id = st.addRoom({ name: `Room ${n}`, origin: [x, z], width: w, depth: d }, levelId)
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
      ? 'Polygon'
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

  // The drawing-tool palette (desktop: a button row; mobile: a compact <select>
  // so the whole bar stays one row instead of wrapping "Auto room" to 2 lines).
  const toolPalette = (
    <div className="seg accent" style={{ marginLeft: 4 }}>
      {toolList.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => pickTool(t)}
          className={`capitalize${tool === t ? ' on' : ''}`}
          title={
            t === 'polyroom'
              ? 'Polygon room — click vertices, click the first to close'
              : t === 'autoroom'
                ? 'Auto room — click inside a wall-enclosed area to make a room from it'
                : t === 'polyline'
                  ? 'Polyline markup — click vertices, Enter to finish (open), click the first to close'
                  : undefined
          }
        >
          {toolLabel(t)}
        </button>
      ))}
    </div>
  )

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
              URL.revokeObjectURL(backdrop.url)
              if (backdropUrlRef.current === backdrop.url) backdropUrlRef.current = null
              setBackdrop(null)
              void removePersistedBackdrop()
              if (tool === 'scale') setTool('select')
            }}
            title="Remove reference photo"
          >
            ✕
          </button>
        </div>
      )}
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
        ↶
      </button>
      <button
        type="button"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => useStore.getState().redo()}
      >
        ↷
      </button>
    </div>
  )

  // Snap-grid size + zoom — frequent but lower-priority than undo/redo.
  const gridZoom = (
    <>
      {/* Snap-grid size — finer = more precise placement. */}
      <label className="seg" style={{ alignItems: 'center', gap: 6, paddingLeft: 8 }}>
        <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Grid
        </span>
        <select
          aria-label="Snap grid size"
          className="input"
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value))}
        >
          {GRID_SIZES.map((g) => (
            <option key={g} value={g}>
              {g < 1 ? `${+(g * 100).toFixed(1)} cm` : `${g} m`}
            </option>
          ))}
        </select>
      </label>
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
    <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
      Total{' '}
      <b className="mono" style={{ color: 'var(--text)' }}>
        {formatArea(total, units)}
      </b>{' '}
      · {levelPlan.rooms.length} rooms
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
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="label">Wall colour</span>
        <input
          type="color"
          aria-label="Wall colour"
          value={plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR}
          onChange={(e) => a.updateFloorPlanMeta({ wallColor: e.target.value })}
          style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'none' }}
        />
      </label>
    </>
  )

  return (
    <div className="plan-screen absolute inset-0 z-30 flex flex-col">
      {/* North/compass rose (SweetHome3DJS parity) — pinned to the editor frame,
          the needle rotates with the plan's orientation. */}
      {fCompass ? (
        <div
          className="panel"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            zIndex: 5,
            width: 52,
            height: 52,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            opacity: 0.9,
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
      ) : null}
      {/* Header / toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2"
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
              <select
                aria-label="Drawing tool"
                className="input"
                value={tool === 'scale' ? 'select' : tool}
                onChange={(e) => pickTool(e.target.value as Tool)}
                style={{ flex: 1, minWidth: 0 }}
              >
                {toolList.map((t) => (
                  <option key={t} value={t}>
                    {toolLabel(t)}
                  </option>
                ))}
              </select>
            )}
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
            <span className="panel-title">Floor plan</span>
            <input
              value={plan.name}
              onChange={(e) => a.updateFloorPlanMeta({ name: e.target.value })}
              className="input"
              style={{ width: 192 }}
              aria-label="Plan name"
            />
            <LevelTabs plan={plan} activeLevelId={levelId} onSelect={setActiveLevelId} />
            {viewToggle}
            {editMode === 'edit' && toolPalette}
            {editMode === 'edit' && wallTypeSeg}
            {templateLibrary}
            <PlanMenu label="Plan">{fileActions}</PlanMenu>
            <div className="ml-auto flex items-center gap-2">
              {multiSelectToggle}
              {quickActions}
              <PlanMenu
                label="View"
                active={showWallDims || showFurniture || labelsOn || showOtherLevels}
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
              <LevelTabs plan={plan} activeLevelId={levelId} onSelect={setActiveLevelId} />
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

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        {/* Canvas — also a drop zone for the reference image */}
        <div
          ref={canvasRef}
          className="plan-canvas min-h-0 flex-1 overflow-auto p-4"
          // Wheel zoom is wired as a native non-passive listener (see effect
          // above); a React onWheel here would be passive and couldn't
          // preventDefault. Right-drag pans, so suppress its context menu.
          onContextMenu={(e) => {
            // Swallow the menu only when a right-drag pan actually moved.
            if (panDidMove.current) {
              e.preventDefault()
              panDidMove.current = false
            }
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
                      fill={isSel ? 'var(--accent-soft)' : 'var(--surface-2)'}
                      stroke={isSel ? 'var(--accent)' : 'var(--border-2)'}
                      strokeDasharray="4 3"
                    />
                  ) : (
                    <>
                      <rect
                        x={toPx(r.origin[0])}
                        y={toPx(r.origin[1])}
                        width={r.width * PX}
                        height={r.depth * PX}
                        fill={isSel ? 'var(--accent-soft)' : 'var(--surface-2)'}
                        stroke={isSel ? 'var(--accent)' : 'var(--border-2)'}
                        strokeDasharray="4 3"
                      />
                      {r.extension && (
                        <rect
                          x={toPx(r.origin[0] + r.extension.offset[0])}
                          y={toPx(r.origin[1] + r.extension.offset[1])}
                          width={r.extension.width * PX}
                          height={r.extension.depth * PX}
                          fill={isSel ? 'var(--accent-soft)' : 'var(--surface-2)'}
                          stroke={isSel ? 'var(--accent)' : 'var(--border-2)'}
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
                    ? r.polygon.map(([vx, vz], i) => (
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
                        />
                      ))
                    : null}
                  {(() => {
                    // Progressive detail by on-screen room size: full (name +
                    // area) → name only → hidden. Keeps the most important info
                    // (the name) longest as the plan zooms out / shrinks. A
                    // selected room always shows full so editing stays legible.
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
                    const totalLines = nameLines.length + (detail === 'full' ? 1 : 0)
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
                          <tspan x={px} dy={lineH + 2} fill="var(--text-3)">
                            {formatArea(planRoomArea(r), units)}
                          </tspan>
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
                const pts = obbCorners(obb)
                  .map(([x, z]) => `${toPx(x)},${toPx(z)}`)
                  .join(' ')
                const isSel = selectedItemId === it.id
                return (
                  <polygon
                    key={it.id}
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
                      const willMove = beginElementDrag(e, selectedItemId === it.id)
                      st.selectItem(it.id) // a tap always selects (for inspect/then-drag)
                      if (!willMove) return // view / unselected-on-touch: let it pan
                      const [wx, wz] = pointerWorld(e)
                      st.pushHistory()
                      setMovingItem({ id: it.id, gx: wx - it.position[0], gz: wz - it.position[1] })
                    }}
                  />
                )
              })}

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
                      const willMove = beginElementDrag(e, sel?.type === 'note' && sel.id === nt.id)
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
              const d = wallSvgPath(w, toPx)
              const stroke = inSel
                ? 'var(--accent)'
                : w.thickness === 'external'
                  ? 'var(--plan-wall)'
                  : 'var(--text-3)'
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
                      strokeWidth={(w.thickness === 'external' ? 7 : 4) + 11}
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
                    strokeWidth={w.thickness === 'external' ? 7 : 4}
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
                const ROT_OFF = 30
                const hx = mpx + npx * ROT_OFF
                const hy = mpy + npy * ROT_OFF
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
                    {/* Rotate handle */}
                    <line
                      x1={mpx}
                      y1={mpy}
                      x2={hx}
                      y2={hy}
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      style={{ pointerEvents: 'none' }}
                    />
                    <circle
                      cx={hx}
                      cy={hy}
                      r={7}
                      fill="var(--surface-solid)"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
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
                      }}
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
              const color = isSel
                ? 'var(--accent)'
                : o.kind === 'door'
                  ? 'var(--accent)'
                  : 'var(--accent-soft-text)'
              const strokeW = wall.thickness === 'external' ? 7 : 4
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
            {draft && tool === 'wall' && (
              <>
                <line
                  x1={toPx(draft.x0)}
                  y1={toPx(draft.z0)}
                  x2={toPx(draft.x)}
                  y2={toPx(draft.z)}
                  stroke="var(--accent)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                {/* Snap markers at the exact (grid/wall-snapped) endpoints, so the
                    point you're placing is visible even under a fingertip. The
                    filled dot is the start/anchor; the ring is the live end. */}
                <circle cx={toPx(draft.x0)} cy={toPx(draft.z0)} r={5} fill="var(--accent)" />
                <circle
                  cx={toPx(draft.x)}
                  cy={toPx(draft.z)}
                  r={5}
                  fill="var(--surface-solid)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              </>
            )}
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
                readable halo so you always know the current length/size. */}
            {draft && (
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
                  ? formatLength(Math.hypot(draft.x - draft.x0, draft.z - draft.z0), units)
                  : `${formatLength(Math.abs(draft.x - draft.x0), units)} × ${formatLength(Math.abs(draft.z - draft.z0), units)}  (${formatArea(Math.abs(draft.x - draft.x0) * Math.abs(draft.z - draft.z0), units)})`}
              </text>
            )}
          </svg>
        </div>

        {/* Inspector — edits hit the active storey's elements */}
        <PlanInspector levelId={levelId} />
      </div>
    </div>
  )
}

/** Save / load / delete named apartments (the plan library). */
