import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  GROUND_LEVEL_ID,
  levelAsPlan,
  levelById,
  levelOfItem,
  planLevels,
} from '../../floorplan/levels'
import { polylinePointsAttr } from '../../floorplan/polyline'
import { roomLabelPoint } from '../../floorplan/roomCentroid'
import { detectRoomPolygon } from '../../floorplan/roomDetect'
import { PLAN_TEMPLATES } from '../../floorplan/templates'
import type { PlanWall } from '../../floorplan/types'
import { planBounds, planRoomArea, planTotalArea, wallLength } from '../../floorplan/types'
import { useCatalogGetter } from '../../furniture/catalog'
import { itemPrice } from '../../furniture/furniturePrices'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatArea, formatDims, formatLength } from '../../utils/measurement'
import { evictPanoStop } from '../panorama/panoImageIdb'
import {
  type BackdropMeta,
  persistBackdrop,
  readPersistedBackdrop,
  removePersistedBackdrop,
  updateBackdropMeta,
} from './backdropPersist'
import { exportPlanPng } from './exportPlanPng'
import { LevelTabs } from './LevelTabs'
import { PlanInspector } from './PlanInspector'
import { PLAN_LABEL_TEXT, planLabelLines } from './planLabels'

/** Muted top-down fill per furniture category for the 2D plan layer.
 *  Tokens live in `screens.css` (`--plan-cat-*`) so the plan themes correctly;
 *  `exportPlanPng.ts` PLAN_VARS must list every var used here. */
const CATEGORY_FILL: Record<FurnitureCategory, string> = {
  beds: 'var(--plan-cat-beds)',
  seating: 'var(--plan-cat-seating)',
  tables: 'var(--plan-cat-tables)',
  storage: 'var(--plan-cat-storage)',
  kitchen: 'var(--plan-cat-kitchen)',
  bathroom: 'var(--plan-cat-bathroom)',
  appliances: 'var(--plan-cat-appliances)',
  lighting: 'var(--plan-cat-lighting)',
  decor: 'var(--plan-cat-decor)',
  textiles: 'var(--plan-cat-textiles)',
  outdoor: 'var(--plan-cat-outdoor)',
  electronics: 'var(--plan-cat-electronics)',
  kids: 'var(--plan-cat-kids)',
  laundry: 'var(--plan-cat-laundry)',
  others: 'var(--plan-cat-others)',
}

type Tool =
  | 'select'
  | 'wall'
  | 'room'
  | 'polyroom'
  | 'autoroom'
  | 'split'
  | 'door'
  | 'window'
  | 'scale'
  | 'text'
  | 'dimension'
  | 'polyline'

/** A reference photo/scan traced over to draw walls. Session-scoped (the object
 *  URL lives only this session); `mPerPx` is the calibrated real-world scale. */
interface Backdrop {
  url: string
  /** Natural pixel dimensions of the loaded image. */
  w: number
  h: number
  opacity: number
  /** Metres per image pixel (set via the Scale tool). */
  mPerPx: number
  /** World position (m) of the image's top-left corner. */
  ox: number
  oz: number
}

const FIT_PAD = 0.6 // metres of breathing room when fitting the plan to the view
// Large grid margin around the plan so the canvas reads as an open, pannable
// grid (Figma-style) rather than a tight box that clips anything drawn outside
// the current plan bounds. The plan stays centred (equal margin all sides).
const GRID_MARGIN = 20
const EXPORT_PAD = 1 // metres of padding around the plan in the exported PNG
const MAX_W = 940
const MAX_H = 620

/**
 * 2D top-down Floor Plan Editor. Edits the active `floorPlan` in the store:
 * draw interior/exterior walls, rectangular rooms (auto area), and doors /
 * windows on walls. Coordinates are metres; drawing snaps to the grid size.
 * The 3D apartment renders whatever plan is active here.
 */
export function FloorPlanEditor() {
  const editing = useStore((s) => s.floorPlanEditing)
  const plan = useStore((s) => s.floorPlan)
  const gridSize = useStore((s) => s.gridSize)
  const sel = useStore((s) => s.planSelection)
  const units = useStore((s) => s.units)
  const a = useStore.getState()

  const items = useStore((s) => s.items)
  const planLabels = useStore((s) => s.planLabels)
  const fPlanLabels = useFeature('planLabels')
  const labelsOn = fPlanLabels && planLabels !== 'off'
  const selectedItemId = useStore((s) => s.selectedItemId)
  const annotations = useStore((s) => s.annotations)
  const { getDef, ref: catalogRef } = useCatalogGetter()
  const fPanoTour = useFeature('panoTour')
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
  // Active tour-stop drag: grab offset from the stop's world position.
  const [movingStop, setMovingStop] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active note drag (select tool): grab offset from the note's position.
  const [movingNote, setMovingNote] = useState<{ id: string; gx: number; gz: number } | null>(null)
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
  const [showWallDims, setShowWallDims] = useState(true)
  // Show the OTHER storeys' walls as a dimmed underlay (SH3D "all levels"), so
  // you can stack walls / line up stairs between floors. Off by default.
  const [showOtherLevels, setShowOtherLevels] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // Middle-mouse drag-to-pan: start client pos + canvas scroll at grab.
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)

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

  const [ew, ed] = planBounds(plan)
  const basePX = useMemo(() => {
    const fitW = MAX_W / (ew + FIT_PAD * 2)
    const fitH = MAX_H / (ed + FIT_PAD * 2)
    return Math.max(24, Math.min(fitW, fitH, 80))
  }, [ew, ed])
  // User zoom (ctrl/⌘+wheel or the ± buttons) multiplies the base px-per-metre;
  // every coordinate (toPx + its inverse) reads PX, so zoom stays consistent.
  const [zoom, setZoom] = useState(1)
  const PX = basePX * zoom
  // Canvas is the plan plus a generous grid margin on every side (pannable via
  // the scroll container; the plan stays centred because the margin is equal).
  const W = (ew + GRID_MARGIN * 2) * PX
  const H = (ed + GRID_MARGIN * 2) * PX
  const toPx = (m: number) => (m + GRID_MARGIN) * PX
  const snap = (m: number) => (gridSize > 0 ? Math.round(m / gridSize) * gridSize : m)

  // Scroll the (large, margin-padded) canvas so the plan is centred. Retries
  // each frame until the SVG has laid out at its full (inline) size — before
  // that, scrollLeft clamps to 0 (content not yet wider than the view).
  const centerPlan = useCallback(
    (px: number) => {
      const el = canvasRef.current
      if (!el) return
      let frames = 0
      const run = () => {
        frames++
        if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight || frames > 120) {
          el.scrollLeft = Math.max(0, (ew / 2 + GRID_MARGIN) * px - el.clientWidth / 2)
          el.scrollTop = Math.max(0, (ed / 2 + GRID_MARGIN) * px - el.clientHeight / 2)
          return
        }
        requestAnimationFrame(run)
      }
      requestAnimationFrame(run)
    },
    [ew, ed],
  )

  // Centre the plan when the editor opens. The grid extends every direction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-centre only on open; PX read fresh.
  useEffect(() => {
    if (editing) centerPlan(PX)
  }, [editing, centerPlan])

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
        if (sel) {
          if (sel.type === 'wall') st.removeWall(sel.id, levelId)
          else if (sel.type === 'room') st.removeRoom(sel.id, levelId)
          else if (sel.type === 'note') st.removeNote(sel.id)
          else if (sel.type === 'dim') st.removeDimension(sel.id)
          else if (sel.type === 'polyline') st.removePolyline(sel.id)
          else st.removeOpening(sel.id, levelId)
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

  const pointerWorld = (e: React.PointerEvent, excludeWallId?: string): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    let wx = snap(x / PX - GRID_MARGIN)
    let wz = snap(y / PX - GRID_MARGIN)
    // Vertex snap: prefer an existing wall endpoint (on the active storey)
    // within ~0.3 m so walls connect cleanly at corners. Skip the wall being
    // vertex-dragged so its own endpoints don't capture the cursor.
    let best = 0.3
    for (const w of levelPlan.walls) {
      if (w.id === excludeWallId) continue
      for (const p of [w.start, w.end]) {
        const dd = Math.hypot(p[0] - wx, p[1] - wz)
        if (dd < best) {
          best = dd
          wx = p[0]
          wz = p[1]
        }
      }
    }
    return [wx, wz]
  }

  /** Nearest active-storey wall to a world point, with the projected offset. */
  const nearestWall = (
    wx: number,
    wz: number,
  ): { wall: PlanWall; offset: number; dist: number } | null => {
    let best: { wall: PlanWall; offset: number; dist: number } | null = null
    for (const wall of levelPlan.walls) {
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

  const onDown = (e: React.PointerEvent) => {
    // Middle-button drags to pan the open canvas; ignore right-click. Only the
    // left button draws/selects.
    if (e.button === 1 && canvasRef.current) {
      e.preventDefault()
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        sl: canvasRef.current.scrollLeft,
        st: canvasRef.current.scrollTop,
      }
      svgRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    const [wx, wz] = pointerWorld(e)
    const st = useStore.getState()
    if (tool === 'wall' || tool === 'room' || tool === 'scale' || tool === 'dimension') {
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
      if (hit) {
        const width = tool === 'door' ? 0.9 : 1.2
        const offset = Math.max(0, Math.min(wallLength(hit.wall) - width, hit.offset - width / 2))
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
    if (movingVertex) {
      const [wx, wz] = pointerWorld(e, movingVertex.id)
      useStore.getState().moveWallVertex(movingVertex.id, movingVertex.which, [wx, wz], levelId)
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
    const [wx, wz] = pointerWorld(e)
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
    if (movingVertex) {
      setMovingVertex(null)
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

  return (
    <div className="plan-screen absolute inset-0 z-30 flex flex-col">
      {/* Header / toolbar */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          backdropFilter: 'blur(var(--blur))',
        }}
      >
        <span className="panel-title">Floor plan</span>
        <input
          value={plan.name}
          onChange={(e) => a.updateFloorPlanMeta({ name: e.target.value })}
          className="input"
          style={{ width: 192 }}
        />
        <LevelTabs plan={plan} activeLevelId={levelId} onSelect={setActiveLevelId} />
        <div className="seg accent" style={{ marginLeft: 4 }}>
          {(
            [
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
              // Polyline markup is a Pro annotation tool (flag-gated).
              ...(fPolyline ? (['polyline'] as Tool[]) : []),
            ] as Tool[]
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPolyDraft([])
                setPolylineDraft([])
                setTool(t)
              }}
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
              {t === 'polyroom' ? 'Polygon' : t === 'autoroom' ? 'Auto room' : t}
            </button>
          ))}
        </div>
        {tool === 'wall' && (
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
        )}
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
        <select
          value=""
          onChange={(e) => {
            const tpl = PLAN_TEMPLATES.find((t) => t.id === e.target.value)
            if (!tpl) return
            a.pushHistory()
            a.setItems([])
            a.setFloorPlan(JSON.parse(JSON.stringify(tpl)))
            a.setPlanSelection(null)
          }}
          title="Start from a template apartment"
          className="input"
          style={{ width: 'auto' }}
        >
          <option value="">Template…</option>
          {PLAN_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <PlanLibrary />

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

        <div className="ml-auto flex items-center gap-3">
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
                (plan.name || 'floor-plan')
                  .replace(/[^a-z0-9-_]+/gi, '-')
                  .replace(/^-+|-+$/g, '') || 'floor-plan'
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
          <div className="seg" style={{ alignItems: 'center' }}>
            <button
              type="button"
              title="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
            >
              −
            </button>
            <button
              type="button"
              title="Reset zoom & centre"
              onClick={() => {
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
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}
            >
              +
            </button>
          </div>
          <span className="panel-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>
            Total{' '}
            <b className="mono" style={{ color: 'var(--text)' }}>
              {formatArea(total, units)}
            </b>{' '}
            · {levelPlan.rooms.length} rooms
          </span>
          <button type="button" onClick={exitPlanEditorToScene} className="btn btn-accent btn-sm">
            Done
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Canvas */}
        {/* Canvas — also a drop zone for the reference image */}
        <div
          ref={canvasRef}
          className="plan-canvas min-h-0 flex-1 overflow-auto p-4"
          onWheel={(e) => {
            // Ctrl/⌘+wheel zooms around the cursor; plain wheel scrolls (pans).
            if (!(e.ctrlKey || e.metaKey)) return
            e.preventDefault()
            const el = canvasRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            const px = e.clientX - rect.left
            const py = e.clientY - rect.top
            const cx = el.scrollLeft + px
            const cy = el.scrollTop + py
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
            const next = Math.min(3, Math.max(0.4, zoom * factor))
            if (next === zoom) return
            setZoom(next)
            const r = next / zoom
            requestAnimationFrame(() => {
              el.scrollLeft = cx * r - px
              el.scrollTop = cy * r - py
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
              cursor: tool === 'select' ? 'default' : 'crosshair',
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

            {/* Rooms (active storey) */}
            {levelPlan.rooms.map((r) => {
              const isSel = sel?.type === 'room' && sel.id === r.id
              return (
                <g
                  key={r.id}
                  style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                  onPointerDown={(e) => {
                    if (tool !== 'select') return
                    e.stopPropagation()
                    const [wx, wz] = pointerWorld(e)
                    a.setPlanSelection({ type: 'room', id: r.id })
                    setMoving({ id: r.id, gx: wx - r.origin[0], gz: wz - r.origin[1] })
                    svgRef.current?.setPointerCapture(e.pointerId)
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
                  {(() => {
                    const [lx, lz] = roomLabelPoint(r)
                    return (
                      <text
                        x={toPx(lx)}
                        y={toPx(lz)}
                        textAnchor="middle"
                        className="select-none"
                        fontSize={11}
                        fill="var(--text-2)"
                      >
                        <tspan x={toPx(lx)}>{r.name}</tspan>
                        <tspan x={toPx(lx)} dy={14} fill="var(--text-3)">
                          {formatArea(planRoomArea(r), units)}
                        </tspan>
                      </text>
                    )
                  })()}
                </g>
              )
            })}

            {/* Furniture footprints — the live 3D layout, top-down, filtered to
                the active storey. Click to select (shared with 3D); drag
                (select tool) to move. */}
            {levelItems.map((it) => {
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
                    e.stopPropagation()
                    const [wx, wz] = pointerWorld(e)
                    const st = useStore.getState()
                    st.selectItem(it.id)
                    st.pushHistory()
                    setMovingItem({ id: it.id, gx: wx - it.position[0], gz: wz - it.position[1] })
                    svgRef.current?.setPointerCapture(e.pointerId)
                  }}
                />
              )
            })}

            {/* Furniture labels. When the Labels toggle is on (PARITY-PLANLABELS),
                every footprint shows its name (+ price); otherwise just the
                selected one, so the user can always tell what they clicked. */}
            {(() => {
              const labelled = labelsOn
                ? levelItems
                : levelItems.filter((i) => i.id === selectedItemId)
              return labelled.map((it) => {
                const def = getDef(it.defId)
                const name = it.label ?? def?.name
                if (!name) return null
                const variant = typeof it.props.variant === 'string' ? it.props.variant : undefined
                const price = def ? itemPrice(def, def.category, variant) : undefined
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
                      <tspan key={ln} x={cx} dy={i === 0 ? 0 : 12} fontWeight={i === 0 ? 700 : 600}>
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
                      e.stopPropagation()
                      const [wx, wz] = pointerWorld(e)
                      useStore.getState().setPlanSelection({ type: 'note', id: nt.id })
                      setMovingNote({ id: nt.id, gx: wx - nt.x, gz: wz - nt.z })
                      svgRef.current?.setPointerCapture(e.pointerId)
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
              return (
                <line
                  key={w.id}
                  x1={toPx(w.start[0])}
                  y1={toPx(w.start[1])}
                  x2={toPx(w.end[0])}
                  y2={toPx(w.end[1])}
                  stroke={
                    isSel
                      ? 'var(--accent)'
                      : w.thickness === 'external'
                        ? 'var(--plan-wall)'
                        : 'var(--text-3)'
                  }
                  strokeWidth={w.thickness === 'external' ? 7 : 4}
                  strokeLinecap="round"
                  onPointerDown={(e) => {
                    if (tool === 'select') {
                      e.stopPropagation()
                      a.setPlanSelection({ type: 'wall', id: w.id })
                    }
                  }}
                  style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
                />
              )
            })}

            {/* Persistent wall-length labels (a staple of pro floor planners),
                placed at each wall midpoint, nudged to the wall's outward side.
                Shown only for walls long enough to be legible. */}
            {showWallDims &&
              levelPlan.walls.map((w) => {
                const len = wallLength(w)
                if (len < 0.4) return null
                const mx = (w.start[0] + w.end[0]) / 2
                const mz = (w.start[1] + w.end[1]) / 2
                const ux = (w.end[0] - w.start[0]) / len
                const uz = (w.end[1] - w.start[1]) / len
                // Perpendicular offset (in metres) so the label clears the line.
                const off = 0.28
                const isSel = sel?.type === 'wall' && sel.id === w.id
                return (
                  <text
                    key={`dim-${w.id}`}
                    x={toPx(mx - uz * off)}
                    y={toPx(mz + ux * off)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="plan-dim-label"
                    fill={isSel ? 'var(--accent)' : 'var(--text-2)'}
                    style={{ pointerEvents: 'none', fontSize: 11, fontWeight: 600 }}
                  >
                    {formatLength(len, units)}
                  </text>
                )
              })}

            {/* Opening (door/window) width labels — same "Dims" toggle. Placed on
                the side opposite a door's swing so they clear the arc. */}
            {showWallDims &&
              levelPlan.openings.map((o) => {
                const wall = levelPlan.walls.find((w) => w.id === o.wallId)
                if (!wall) return null
                const len = wallLength(wall)
                if (len === 0) return null
                const ux = (wall.end[0] - wall.start[0]) / len
                const uz = (wall.end[1] - wall.start[1]) / len
                const mx = wall.start[0] + ux * (o.offset + o.width / 2)
                const mz = wall.start[1] + uz * (o.offset + o.width / 2)
                // (-uz, ux) is the wall's "right" normal — a door swinging right
                // has its arc there, so label the opposite side.
                const off = o.kind === 'door' && doorSwing(o) === 'right' ? -0.32 : 0.32
                const isSel = sel?.type === 'opening' && sel.id === o.id
                return (
                  <text
                    key={`odim-${o.id}`}
                    x={toPx(mx - uz * off)}
                    y={toPx(mz + ux * off)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="plan-dim-label"
                    fill={isSel ? 'var(--accent)' : 'var(--accent-soft-text)'}
                    style={{ pointerEvents: 'none', fontSize: 10, fontWeight: 600 }}
                  >
                    {formatLength(o.width, units)}
                  </text>
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

            {/* Endpoint handles for the selected wall (drag to reshape; shared
                corners move together). Lets the user pull a rectangle into an
                L-shape by dragging one corner. */}
            {tool === 'select' &&
              sel?.type === 'wall' &&
              (() => {
                const w = levelPlan.walls.find((x) => x.id === sel.id)
                if (!w) return null
                return (['start', 'end'] as const).map((which) => {
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
                      }}
                    />
                  )
                })
              })()}

            {/* Openings — architectural symbols (door swing / window double-line) */}
            {levelPlan.openings.map((o) => {
              const wall = levelPlan.walls.find((w) => w.id === o.wallId)
              if (!wall) return null
              const len = wallLength(wall)
              if (len === 0) return null
              const ux = (wall.end[0] - wall.start[0]) / len
              const uz = (wall.end[1] - wall.start[1]) / len
              const nx = -uz // wall normal
              const nz = ux
              const sPt: [number, number] = [
                wall.start[0] + ux * o.offset,
                wall.start[1] + uz * o.offset,
              ]
              const ePt: [number, number] = [
                wall.start[0] + ux * (o.offset + o.width),
                wall.start[1] + uz * (o.offset + o.width),
              ]
              const isSel = sel?.type === 'opening' && sel.id === o.id
              const color = o.kind === 'door' ? 'var(--accent)' : 'var(--accent-soft-text)'
              const strokeW = wall.thickness === 'external' ? 7 : 4
              const onPD = (e: React.PointerEvent) => {
                if (tool === 'select') {
                  e.stopPropagation()
                  a.setPlanSelection({ type: 'opening', id: o.id })
                }
              }
              return (
                <g key={o.id} onPointerDown={onPD} style={{ cursor: 'pointer' }}>
                  {/* Mask the wall under the opening */}
                  <line
                    x1={toPx(sPt[0])}
                    y1={toPx(sPt[1])}
                    x2={toPx(ePt[0])}
                    y2={toPx(ePt[1])}
                    stroke="var(--surface-solid)"
                    strokeWidth={strokeW + 2}
                    strokeLinecap="butt"
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
              <line
                x1={toPx(draft.x0)}
                y1={toPx(draft.z0)}
                x2={toPx(draft.x)}
                y2={toPx(draft.z)}
                stroke="var(--accent)"
                strokeWidth={4}
                strokeLinecap="round"
              />
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
            {/* Live dimension readout while drawing. */}
            {draft && (
              <text
                x={toPx(draft.x) + 8}
                y={toPx(draft.z) - 8}
                fontSize={12}
                fill="var(--accent-soft-text)"
                className="select-none"
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
function PlanLibrary() {
  const saved = useStore((s) => s.savedPlans)
  const plan = useStore((s) => s.floorPlan)
  const a = useStore.getState()
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => a.saveCurrentPlan(plan.name)}
        title="Save this apartment to your library"
        className="btn btn-soft btn-sm"
      >
        Save
      </button>
      {saved.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) a.loadSavedPlan(e.target.value)
          }}
          title="Load a saved apartment"
          className="input"
          style={{ width: 'auto' }}
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
            const m = saved.find((p) => p.name === plan.name)
            if (m) a.deleteSavedPlan(m.id)
          }}
          title="Delete this saved apartment from the library"
          className="btn btn-danger btn-sm"
        >
          Delete
        </button>
      )}
    </div>
  )
}

/** Grid lines spanning the whole (margin-padded) canvas, so the plan sits on an
 *  open grid you can draw/pan across — not a tight box around the current
 *  bounds. Memoised: its inputs are stable during a wall drag, so the ~200
 *  lines don't re-render every pointer-move. */
const GridLines = memo(function GridLines({
  W,
  H,
  PX,
  gridSize,
  margin,
  ew,
  ed,
}: {
  W: number
  H: number
  PX: number
  gridSize: number
  margin: number
  ew: number
  ed: number
}) {
  const g = gridSize > 0 ? gridSize : 0.5
  const lines: React.ReactNode[] = []
  const x0 = Math.ceil(-margin / g) * g
  const z0 = Math.ceil(-margin / g) * g
  for (let x = x0; x <= ew + margin + 1e-6; x += g) {
    const major = Math.abs(x - Math.round(x)) < 1e-6
    const px = (x + margin) * PX
    lines.push(
      <line
        key={`vx${x.toFixed(3)}`}
        x1={px}
        y1={0}
        x2={px}
        y2={H}
        stroke={major ? 'var(--border-2)' : 'var(--border)'}
        strokeWidth={major ? 1 : 0.5}
      />,
    )
  }
  for (let z = z0; z <= ed + margin + 1e-6; z += g) {
    const major = Math.abs(z - Math.round(z)) < 1e-6
    const py = (z + margin) * PX
    lines.push(
      <line
        key={`hz${z.toFixed(3)}`}
        x1={0}
        y1={py}
        x2={W}
        y2={py}
        stroke={major ? 'var(--border-2)' : 'var(--border)'}
        strokeWidth={major ? 1 : 0.5}
      />,
    )
  }
  return <g>{lines}</g>
})
