import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type FloorPlan, planBounds } from '../../../floorplan/types'
import { planCenter as planCenterGeo } from './floorPlanGeometry'
import {
  FIT_PAD,
  GRID_MARGIN,
  MAX_H,
  MAX_W,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_WHEEL_SENS,
} from './planConstants'

/** Live pan-gesture baseline (client pos + canvas scroll at grab). */
interface PanState {
  x: number
  y: number
  sl: number
  st: number
}

/**
 * Owns the 2D editor's **viewport**: the fit-to-screen base scale, user zoom
 * (wheel / pinch / ± buttons, all anchored so the point under the cursor stays
 * put), the pannable scroll container, and the metre↔pixel scale (`PX`/`toPx`,
 * canvas `W`/`H`). Extracted from `FloorPlanEditor` as behaviour-preserving
 * code-motion (MOD-FPE-SPLIT).
 *
 * The pan + pinch **gestures live in the editor's shared pointer dispatch**, so
 * the raw refs they mutate (`panRef`, `panDidMove`, `touchPts`, `pinch`,
 * `zoomRef`, `canvasRef`, `svgRef`) are returned for the dispatch to read; this
 * hook owns the zoom/scroll *mechanics* (`zoomToPoint`/`zoomAroundCentre`, the
 * native wheel listener, the post-zoom scroll re-anchor) + the fit
 * (`centerPlan`) + the coordinate scale.
 */
export function usePlanViewport(plan: FloorPlan, levelPlan: FloorPlan, editing: boolean) {
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // Middle/right-mouse drag-to-pan: start client pos + canvas scroll at grab.
  const panRef = useRef<PanState | null>(null)
  // Whether the current pan actually moved — used to swallow the context menu
  // that a right-drag would otherwise pop at the end of the pan.
  const panDidMove = useRef(false)

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

  // Reset zoom to 1 and re-centre the plan (the "100%" toolbar button).
  const resetView = useCallback(() => {
    pendingScroll.current = null
    setZoom(1)
    requestAnimationFrame(() => centerPlan(basePX))
  }, [centerPlan, basePX])

  return {
    resetView,
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
    basePX,
    zoomToPoint,
    zoomAroundCentre,
    centerPlan,
  }
}
