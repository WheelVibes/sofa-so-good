import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AiPlanError, getVisionKey, recognizeFloorPlan, setVisionKey } from '../../ai/floorPlanAi'
import { obbCorners } from '../../collision/obb'
import { canPlace, itemFootprint } from '../../collision/placement'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { detectRoomPolygon } from '../../floorplan/roomDetect'
import { PLAN_TEMPLATES } from '../../floorplan/templates'
import type { PlanWall } from '../../floorplan/types'
import { planBounds, planRoomArea, planTotalArea, wallLength } from '../../floorplan/types'
import { useCatalogGetter } from '../../furniture/catalog'
import type { FurnitureCategory } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatArea, formatDims, formatLength } from '../../utils/measurement'
import {
  type BackdropMeta,
  persistBackdrop,
  readPersistedBackdrop,
  removePersistedBackdrop,
  updateBackdropMeta,
} from './backdropPersist'
import { exportPlanPng } from './exportPlanPng'
import { PlanInspector } from './PlanInspector'

/** Muted top-down fill per furniture category for the 2D plan layer. */
const CATEGORY_FILL: Record<FurnitureCategory, string> = {
  beds: '#b08a6a',
  seating: '#8a9a7a',
  tables: '#c0a070',
  storage: '#9a8470',
  kitchen: '#9aa0a8',
  bathroom: '#88a8b0',
  appliances: '#8890a0',
  lighting: '#d8c080',
  decor: '#b89a8a',
  textiles: '#b0907a',
  outdoor: '#7a9a70',
  electronics: '#7a8088',
  kids: '#c89aa8',
  laundry: '#90a0a8',
  others: '#9a9488',
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
  const selectedItemId = useStore((s) => s.selectedItemId)
  const annotations = useStore((s) => s.annotations)
  const { getDef, ref: catalogRef } = useCatalogGetter()

  const [tool, setTool] = useState<Tool>('select')
  const [wallType, setWallType] = useState<'internal' | 'external'>('internal')
  const [draft, setDraft] = useState<{ x0: number; z0: number; x: number; z: number } | null>(null)
  // Active room drag (select tool): grab offset from the room origin.
  const [moving, setMoving] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active furniture drag (select tool): grab offset from the item position.
  const [movingItem, setMovingItem] = useState<{ id: string; gx: number; gz: number } | null>(null)
  // Active wall-vertex drag (select tool): which wall endpoint is being moved.
  const [movingVertex, setMovingVertex] = useState<{ id: string; which: 'start' | 'end' } | null>(
    null,
  )
  // In-progress polygon-room vertices (polyroom tool): click to add a vertex,
  // click near the first vertex (or Enter) to close into a room.
  const [polyDraft, setPolyDraft] = useState<[number, number][]>([])
  // Reference photo/scan to trace over (Wave F: photo-to-plan, no ML).
  // Persisted to IDB (blob + calibration) so it survives editor close + reload.
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  // Persistent wall-length labels (on by default; toggle in the editor header).
  const [showWallDims, setShowWallDims] = useState(true)
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

  // Frame the selected furniture in 3D when leaving the editor, so toggling
  // 2D->3D lands on whatever you were working on (the seamless-toggle payoff).
  const exitToScene = useCallback(() => {
    const st = useStore.getState()
    st.setFloorPlanEditing(false)
    if (st.selectedItemId) {
      const it = st.items.find((i) => i.id === st.selectedItemId)
      if (it) st.focusOn(it.position)
    }
  }, [])

  // `P` toggles the editor from anywhere (a persistent 2D<->3D switch), unless
  // the user is typing or in walk mode. Always mounted so it works from 3D too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return
      const st = useStore.getState()
      if (st.cameraMode === 'firstPerson') return
      if (st.floorPlanEditing) exitToScene()
      else st.setFloorPlanEditing(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitToScene])

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
   *  explicit polygon for area/render/containment). Stable (reads the store). */
  const commitPolyRoom = useCallback((verts: [number, number][]) => {
    if (verts.length < 3) return
    const xs = verts.map((v) => v[0])
    const zs = verts.map((v) => v[1])
    const x0 = Math.min(...xs)
    const z0 = Math.min(...zs)
    const st = useStore.getState()
    const n = st.floorPlan.rooms.length + 1
    const id = st.addRoom({
      name: `Room ${n}`,
      origin: [x0, z0],
      width: Math.max(0.1, Math.max(...xs) - x0),
      depth: Math.max(0.1, Math.max(...zs) - z0),
      polygon: verts,
    })
    st.setPlanSelection({ type: 'room', id })
  }, [])

  // Enter closes an in-progress polygon room; Esc cancels it (or exits the
  // editor when nothing is mid-draw); Delete removes the selected element.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && polyDraft.length >= 3) {
        commitPolyRoom(polyDraft)
        setPolyDraft([])
      } else if (e.key === 'Escape') {
        if (polyDraft.length > 0) {
          setPolyDraft([])
          return
        }
        setDraft(null)
        exitToScene()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        const st = useStore.getState()
        if (sel.type === 'wall') st.removeWall(sel.id)
        else if (sel.type === 'room') st.removeRoom(sel.id)
        else st.removeOpening(sel.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, sel, exitToScene, polyDraft, commitPolyRoom])

  if (!editing) return null

  const pointerWorld = (e: React.PointerEvent, excludeWallId?: string): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    let wx = snap(x / PX - GRID_MARGIN)
    let wz = snap(y / PX - GRID_MARGIN)
    // Vertex snap: prefer an existing wall endpoint within ~0.3 m so walls
    // connect cleanly at corners. Skip the wall being vertex-dragged so its own
    // endpoints don't capture the cursor.
    let best = 0.3
    for (const w of plan.walls) {
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

  /** Find the nearest wall to a world point, with the projected offset along it. */
  const nearestWall = (
    wx: number,
    wz: number,
  ): { wall: PlanWall; offset: number; dist: number } | null => {
    let best: { wall: PlanWall; offset: number; dist: number } | null = null
    for (const wall of plan.walls) {
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
    if (tool === 'wall' || tool === 'room' || tool === 'scale') {
      setDraft({ x0: wx, z0: wz, x: wx, z: wz })
    } else if (tool === 'autoroom') {
      // Make a room from the wall loop enclosing the click.
      const poly = detectRoomPolygon(st.floorPlan.walls, [wx, wz])
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
    } else if (tool === 'split') {
      // Split the wall nearest the click at the projected point.
      const hit = nearestWall(wx, wz)
      if (hit) {
        const len = wallLength(hit.wall)
        st.splitWall(hit.wall.id, len > 0 ? hit.offset / len : 0.5)
      }
    } else if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(wx, wz)
      if (hit) {
        const width = tool === 'door' ? 0.9 : 1.2
        const offset = Math.max(0, Math.min(wallLength(hit.wall) - width, hit.offset - width / 2))
        const id = st.addOpening({
          kind: tool,
          wallId: hit.wall.id,
          offset: snap(offset),
          width,
          sill: tool === 'door' ? 0 : 0.95,
          head: tool === 'door' ? 2.1 : 2.1,
        })
        st.setPlanSelection({ type: 'opening', id })
      }
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
    if (movingVertex) {
      const [wx, wz] = pointerWorld(e, movingVertex.id)
      useStore.getState().moveWallVertex(movingVertex.id, movingVertex.which, [wx, wz])
      return
    }
    if (movingItem) {
      const [wx, wz] = pointerWorld(e)
      const st = useStore.getState()
      const it = st.items.find((i) => i.id === movingItem.id)
      const def = it ? catalogRef.current[it.defId] : undefined
      if (!it || !def) return
      const pos: [number, number] = [snap(wx - movingItem.gx), snap(wz - movingItem.gz)]
      const planWalls = isDefaultPlan(st.floorPlan)
        ? buildCollisionWalls(st.doors)
        : planCollisionWalls(st.floorPlan, st.doors)
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
    if (tool === 'wall') {
      if (Math.hypot(draft.x - draft.x0, draft.z - draft.z0) > 0.2) {
        const id = st.addWall({
          start: [draft.x0, draft.z0],
          end: [draft.x, draft.z],
          thickness: wallType,
        })
        st.setPlanSelection({ type: 'wall', id })
      }
    } else if (tool === 'room') {
      const x = Math.min(draft.x0, draft.x)
      const z = Math.min(draft.z0, draft.z)
      const w = Math.abs(draft.x - draft.x0)
      const d = Math.abs(draft.z - draft.z0)
      if (w > 0.3 && d > 0.3) {
        const n = st.floorPlan.rooms.length + 1
        const id = st.addRoom({ name: `Room ${n}`, origin: [x, z], width: w, depth: d })
        st.setPlanSelection({ type: 'room', id })
      }
    }
    setDraft(null)
  }

  const total = planTotalArea(plan)

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
        <div className="seg accent" style={{ marginLeft: 4 }}>
          {(
            ['select', 'wall', 'room', 'polyroom', 'autoroom', 'split', 'door', 'window'] as Tool[]
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPolyDraft([])
                setTool(t)
              }}
              className={`capitalize${tool === t ? ' on' : ''}`}
              title={
                t === 'polyroom'
                  ? 'Polygon room — click vertices, click the first to close'
                  : t === 'autoroom'
                    ? 'Auto room — click inside a wall-enclosed area to make a room from it'
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
            <button
              type="button"
              onClick={runAiWalls}
              disabled={aiBusy}
              title="Experimental: recognise walls from the photo with a vision model (your API key)"
            >
              {aiBusy ? 'Recognising…' : 'AI walls'}
            </button>
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
            · {plan.rooms.length} rooms
          </span>
          <button type="button" onClick={exitToScene} className="btn btn-accent btn-sm">
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

            {/* Rooms */}
            {plan.rooms.map((r) => {
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
                  <text
                    x={toPx(r.origin[0] + r.width / 2)}
                    y={toPx(r.origin[1] + r.depth / 2)}
                    textAnchor="middle"
                    className="select-none"
                    fontSize={11}
                    fill="var(--text-2)"
                  >
                    <tspan x={toPx(r.origin[0] + r.width / 2)}>{r.name}</tspan>
                    <tspan x={toPx(r.origin[0] + r.width / 2)} dy={14} fill="var(--text-3)">
                      {formatArea(planRoomArea(r), units)}
                    </tspan>
                  </text>
                </g>
              )
            })}

            {/* Furniture footprints — the live 3D layout, top-down. Click to
                select (shared with 3D); drag (select tool) to move. */}
            {items.map((it) => {
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
                  fill={isSel ? 'var(--accent-soft)' : (CATEGORY_FILL[def.category] ?? '#9a9488')}
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

            {/* Walls */}
            {plan.walls.map((w) => {
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
              plan.walls.map((w) => {
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
                      fill="#0d9488"
                      fillOpacity={0.1}
                      stroke="#0d9488"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                    />
                    <text
                      x={toPx(x + w / 2)}
                      y={toPx(z + h / 2)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#0d9488"
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
                    stroke="#0d9488"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                  <text
                    x={toPx((ax + bx) / 2)}
                    y={toPx((az + bz) / 2) - 6}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#0d9488"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {formatLength(len, units)}
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
                const w = plan.walls.find((x) => x.id === sel.id)
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
            {plan.openings.map((o) => {
              const wall = plan.walls.find((w) => w.id === o.wallId)
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
                    <>
                      {/* Door leaf + swing arc (hinge at the opening start) */}
                      <line
                        x1={toPx(sPt[0])}
                        y1={toPx(sPt[1])}
                        x2={toPx(sPt[0] + nx * o.width)}
                        y2={toPx(sPt[1] + nz * o.width)}
                        stroke={color}
                        strokeWidth={isSel ? 3 : 2}
                      />
                      <path
                        d={`M ${toPx(ePt[0])} ${toPx(ePt[1])} A ${o.width * PX} ${o.width * PX} 0 0 ${nx * uz - nz * ux > 0 ? 1 : 0} ${toPx(sPt[0] + nx * o.width)} ${toPx(sPt[1] + nz * o.width)}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        opacity={0.7}
                      />
                    </>
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

            {/* Scale calibration line */}
            {draft && tool === 'scale' && (
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

        {/* Inspector */}
        <PlanInspector />
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
