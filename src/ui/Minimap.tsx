import { useEffect, useMemo, useRef, useState } from 'react'
import { useFeature } from '../features/useFeature'
import { itemsOnLevel } from '../floorplan/levels'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import { pointInRoom, wallLength } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import { cameraForwardXZ, cameraPosXZ } from '../scene/cameras/cameraForward'
import { WALK_PLAYER_RADIUS } from '../scene/cameras/walkCameraSettings'
import { requestWalkTeleport } from '../scene/cameras/walkTeleport'
import { useStore } from '../state/store'
import {
  fitMinimapView,
  openingSegments,
  planContentBounds,
  roomPathD,
} from './walk/minimapGeometry'
import { minimapLevelView } from './walk/minimapLevel'
import {
  minimapPointToWorld,
  resolveMinimapTeleport,
  svgViewBoxPoint,
} from './walk/minimapTeleport'

/** Fallback box (CSS px) matching `.minimap`'s desktop size, used for the first
 *  render before the ResizeObserver reports the real box. */
const FALLBACK_BOX = { w: 152, h: 116 }
/** Svg-unit breathing room inside the measured box, on top of `.minimap`'s own
 *  CSS padding — the map otherwise reaches the frosted panel's inner edge. */
const INSET = 3
/** World-metre margin kept around the apartment so wall strokes and the player
 *  arrow never clip at the map's edge. */
const PAD = 0.4

/**
 * Top-down minimap shown in walk mode for orientation: the apartment shell,
 * furniture dots (coloured by category) and a camera arrow at the player's
 * position + heading. The room the player is standing in is highlighted and
 * named, updated live from the camera pose (no React re-render). Reads the live
 * camera pose via the cameraForward signals.
 */
export function Minimap() {
  const cameraMode = useStore((s) => s.cameraMode)
  const fullPlan = useStore((s) => s.floorPlan)
  const allItems = useStore((s) => s.items)
  const viewLevelId = useStore((s) => s.viewLevelId)
  // MINIMAP-LEVEL: draw the storey the walker is ON, not the ground floor. The
  // same `walkLevel`/`levelAsPlan` pair `FirstPersonCamera` uses for its
  // collision walls, so the map and the camera agree by construction. Every
  // downstream read (shapes, walls, openings, the live label, the dots and the
  // teleport target) goes through these two — a raw `s.floorPlan`/`s.items`
  // read here is the bug.
  const { plan, levelId } = useMemo(
    () => minimapLevelView(fullPlan, viewLevelId),
    [fullPlan, viewLevelId],
  )
  const items = useMemo(() => itemsOnLevel(allItems, levelId), [allItems, levelId])
  const catalog = useCatalog()
  const svgRef = useRef<SVGSVGElement>(null)
  const arrowRef = useRef<SVGGElement>(null)
  const labelRef = useRef<SVGTextElement>(null)
  const roomRefs = useRef<Record<string, SVGPathElement | null>>({})
  // The rAF tick below must see the CURRENT storey's rooms without closing over
  // a stale `plan` and without re-deriving the level 60x a second (that would
  // allocate a level array + a spread plan per frame). A ref refreshed on every
  // render gives the same freshness the old `useStore.getState()` read had, for
  // zero per-frame cost.
  const roomsRef = useRef(plan.rooms)
  useEffect(() => {
    roomsRef.current = plan.rooms
  }, [plan])
  const [, force] = useState(0)
  // The widget's real pixel box — the viewBox tracks it (1 svg unit = 1 CSS px)
  // so the map FILLS the rectangle instead of being letterboxed inside a square
  // viewBox (which left a fat empty margin on the long axis). Remeasured on
  // resize / the mobile breakpoint change.
  const [box, setBox] = useState(FALLBACK_BOX)
  // biome-ignore lint/correctness/useExhaustiveDependencies: cameraMode is a real trigger — this component renders null outside walk mode, so the svg (and thus `svgRef.current`) only exists once walk mode is on; the observer must re-attach then.
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0)
        setBox((prev) =>
          Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
            ? prev
            : { w: r.width, h: r.height },
        )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cameraMode])

  // Centre on the apartment's TRUE drawn bounds (walls + rooms), not the padded
  // plan extent — so the apartment sits in the middle of the widget on both axes
  // regardless of where it lives in plan space.
  const b = useMemo(() => planContentBounds(plan), [plan])
  // Uniform fit into the measured box (never distorted), centred on both axes.
  const { scale, offX, offY } = useMemo(
    () => fitMinimapView(b, box.w, box.h, INSET, PAD),
    [b, box.w, box.h],
  )
  const toX = (m: number) => (m - b.minX + PAD) * scale + offX
  const toY = (m: number) => (m - b.minZ + PAD) * scale + offY
  // World→svg transform for the room fills (so `roomPathD`'s world-metre paths
  // line up with the toX/toY-mapped walls + dots): toX(m) = m*scale + offset.
  const offRoomX = (PAD - b.minX) * scale + offX
  const offRoomY = (PAD - b.minZ) * scale + offY

  // Room shapes (accurate for L-shaped / polygon rooms) + centroids for labels.
  const rooms = useMemo(
    () =>
      plan.rooms
        .map((r) => ({ id: r.id, name: r.name, d: roomPathD(r), centre: roomLabelPoint(r) }))
        .filter((r) => r.d.length > 0),
    [plan],
  )
  // Wall openings — doors drawn as gaps, windows as ticks, so room connections
  // read at a glance.
  const openings = useMemo(() => openingSegments(plan), [plan])

  // Animate the camera arrow each frame while in walk mode, and live-highlight +
  // name the room the player is currently inside (cheap attribute writes only).
  // biome-ignore lint/correctness/useExhaustiveDependencies: toX/toY/offX/offY are render-stable scale derivations
  useEffect(() => {
    if (cameraMode !== 'firstPerson') return
    let raf = 0
    let lastRoom = ''
    const tick = () => {
      const x = cameraPosXZ.x
      const z = cameraPosXZ.z
      const g = arrowRef.current
      if (g) {
        const deg = (Math.atan2(cameraForwardXZ.x, -cameraForwardXZ.z) * 180) / Math.PI
        g.setAttribute('transform', `translate(${toX(x)} ${toY(z)}) rotate(${deg})`)
      }
      const here = roomsRef.current.find((r) => pointInRoom(r, x, z))
      const roomId = here?.id ?? ''
      if (roomId !== lastRoom) {
        roomRefs.current[lastRoom]?.classList.remove('lit')
        roomRefs.current[roomId]?.classList.add('lit')
        lastRoom = roomId
        const lbl = labelRef.current
        if (lbl) {
          if (here) {
            const [cx, cz] = roomLabelPoint(here)
            lbl.setAttribute('x', String(toX(cx)))
            lbl.setAttribute('y', String(toY(cz)))
            lbl.textContent = here.name
          } else {
            lbl.textContent = ''
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cameraMode])

  // Re-render dots when the layout changes (force is a no-op dependency hook).
  useEffect(() => force((n) => n + 1), [])

  // Minimap tap-to-teleport (MINIMAP-JUMP): a click/tap converts the pointer's
  // client coords to world XZ (inverting the SAME toX/toY transform this
  // component draws with — the viewBox now matches the measured box, so
  // `svgViewBoxPoint`'s letterbox term is zero here), clamps it inside the
  // tapped (or nearest) room
  // clear of its walls by the walker's own collision radius, and hands the
  // landing spot + facing to `FirstPersonCamera` via the `walkTeleport`
  // module signal (it owns the live camera + furniture blockers; this
  // component only resolves WHERE to go).
  const teleportEnabled = useFeature('minimapTeleport')
  const handleTap = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!teleportEnabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const [svgX, svgY] = svgViewBoxPoint(e.clientX, e.clientY, rect, box.w, box.h)
    const [wx, wz] = minimapPointToWorld(svgX, svgY, b, scale, offX, offY, PAD)
    const target = resolveMinimapTeleport(plan, wx, wz, WALK_PLAYER_RADIUS)
    if (target) requestWalkTeleport(target.x, target.z, target.yaw)
  }

  if (cameraMode !== 'firstPerson') return null

  return (
    <div className="minimap">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${box.w} ${box.h}`}
        className={teleportEnabled ? 'mm-tap' : undefined}
        onClick={handleTap}
        aria-label={teleportEnabled ? 'Walk-mode minimap. Tap a spot to move there.' : undefined}
        role={teleportEnabled ? 'img' : undefined}
      >
        {/* Rooms — world-metre paths placed by the shared world→svg transform so
            L-shaped / polygon rooms render (and highlight) accurately. */}
        <g transform={`translate(${offRoomX} ${offRoomY}) scale(${scale})`}>
          {rooms.map((r) => (
            <path
              key={r.id}
              ref={(el) => {
                roomRefs.current[r.id] = el
              }}
              className="mm-room"
              vectorEffect="non-scaling-stroke"
              d={r.d}
            />
          ))}
        </g>
        {/* Walls */}
        {plan.walls.map((w) =>
          wallLength(w) === 0 ? null : (
            <line
              key={w.id}
              x1={toX(w.start[0])}
              y1={toY(w.start[1])}
              x2={toX(w.end[0])}
              y2={toY(w.end[1])}
              stroke="var(--text-3)"
              strokeWidth={w.thickness === 'external' ? 2 : 1}
              strokeLinecap="round"
            />
          ),
        )}
        {/* Wall openings: doors "cut" the wall (drawn in the panel bg over it),
            windows show a thin accent tick. */}
        {openings.map((op) =>
          op.kind === 'door' ? (
            <line
              key={op.id}
              x1={toX(op.a[0])}
              y1={toY(op.a[1])}
              x2={toX(op.b[0])}
              y2={toY(op.b[1])}
              stroke="var(--surface)"
              strokeWidth={3}
              strokeLinecap="butt"
            />
          ) : (
            <line
              key={op.id}
              x1={toX(op.a[0])}
              y1={toY(op.a[1])}
              x2={toX(op.b[0])}
              y2={toY(op.b[1])}
              stroke="var(--accent)"
              strokeWidth={1.25}
              strokeLinecap="butt"
              opacity={0.7}
            />
          ),
        )}
        {/* Furniture dots */}
        {items.map((it) => {
          const def = catalog[it.defId]
          if (!def) return null
          return (
            <circle
              key={it.id}
              cx={toX(it.position[0])}
              cy={toY(it.position[1])}
              r={2}
              fill={CATEGORY_COLORS[def.category]}
            />
          )
        })}
        {/* Current-room name — position + text written live by the rAF. */}
        <text ref={labelRef} className="mm-label" textAnchor="middle" dominantBaseline="central" />
        {/* Player marker — a soft accent halo behind a bigger, outlined arrow so
            "you are here, facing this way" reads at a glance against any room
            fill (the old 12-unit arrow disappeared over furniture dots). */}
        <g ref={arrowRef}>
          <circle className="mm-cam-halo" r={7} />
          <path
            className="mm-cam"
            d="M 0 -8.5 L 5.5 6.5 L 0 3.4 L -5.5 6.5 Z"
            stroke="var(--surface-solid)"
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}
