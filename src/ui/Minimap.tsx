import { useEffect, useMemo, useRef, useState } from 'react'
import { type PlanRoom, planBounds, pointInRoom, wallLength } from '../floorplan/types'
import { useCatalog } from '../furniture/catalog'
import type { FurnitureCategory } from '../furniture/types'
import { cameraForwardXZ, cameraPosXZ } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { openingSegments, roomPathD } from './walk/minimapGeometry'

const SIZE = 168
const PAD = 0.4

const DOT: Partial<Record<FurnitureCategory, string>> = {
  seating: '#3b82f6',
  beds: '#8b5cf6',
  tables: '#f59e0b',
  storage: '#10b981',
  appliances: '#ef4444',
  kitchen: '#ec4899',
  bathroom: '#06b6d4',
  textiles: '#f97316',
  outdoor: '#84cc16',
  electronics: '#0ea5e9',
  kids: '#d946ef',
  laundry: '#14b8a6',
}

/** World-metre centre of a room (polygon centroid, else the main-rect centre). */
function roomCentre(r: PlanRoom): [number, number] {
  if (r.polygon && r.polygon.length > 0) {
    const n = r.polygon.length
    return [
      r.polygon.reduce((a, p) => a + p[0], 0) / n,
      r.polygon.reduce((a, p) => a + p[1], 0) / n,
    ]
  }
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

/**
 * Top-down minimap shown in walk mode for orientation: the apartment shell,
 * furniture dots (coloured by category) and a camera arrow at the player's
 * position + heading. The room the player is standing in is highlighted and
 * named, updated live from the camera pose (no React re-render). Reads the live
 * camera pose via the cameraForward signals.
 */
export function Minimap() {
  const cameraMode = useStore((s) => s.cameraMode)
  const plan = useStore((s) => s.floorPlan)
  const items = useStore((s) => s.items)
  const catalog = useCatalog()
  const arrowRef = useRef<SVGGElement>(null)
  const labelRef = useRef<SVGTextElement>(null)
  const roomRefs = useRef<Record<string, SVGPathElement | null>>({})
  const [, force] = useState(0)

  const [W, D] = useMemo(() => planBounds(plan), [plan])
  const scale = useMemo(() => (SIZE - 12) / Math.max(W + PAD * 2, D + PAD * 2), [W, D])
  const toX = (m: number) => (m + PAD) * scale + 6
  const toY = (m: number) => (m + PAD) * scale + 6
  // World→svg transform for the room fills (so `roomPathD`'s world-metre paths
  // line up with the toX/toY-mapped walls + dots): toX(m) = m*scale + off.
  const off = PAD * scale + 6

  // Room shapes (accurate for L-shaped / polygon rooms) + centroids for labels.
  const rooms = useMemo(
    () =>
      plan.rooms
        .map((r) => ({ id: r.id, name: r.name, d: roomPathD(r), centre: roomCentre(r) }))
        .filter((r) => r.d.length > 0),
    [plan],
  )
  // Wall openings — doors drawn as gaps, windows as ticks, so room connections
  // read at a glance.
  const openings = useMemo(() => openingSegments(plan), [plan])

  // Animate the camera arrow each frame while in walk mode, and live-highlight +
  // name the room the player is currently inside (cheap attribute writes only).
  // biome-ignore lint/correctness/useExhaustiveDependencies: toX/toY/off are render-stable scale derivations
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
      const here = useStore.getState().floorPlan.rooms.find((r) => pointInRoom(r, x, z))
      const roomId = here?.id ?? ''
      if (roomId !== lastRoom) {
        roomRefs.current[lastRoom]?.classList.remove('lit')
        roomRefs.current[roomId]?.classList.add('lit')
        lastRoom = roomId
        const lbl = labelRef.current
        if (lbl) {
          if (here) {
            const [cx, cz] = roomCentre(here)
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

  if (cameraMode !== 'firstPerson') return null

  return (
    <div className="minimap">
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Rooms — world-metre paths placed by the shared world→svg transform so
            L-shaped / polygon rooms render (and highlight) accurately. */}
        <g transform={`translate(${off} ${off}) scale(${scale})`}>
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
              fill={DOT[def.category] ?? '#9ca3af'}
            />
          )
        })}
        {/* Current-room name — position + text written live by the rAF. */}
        <text ref={labelRef} className="mm-label" textAnchor="middle" />
        {/* Camera arrow */}
        <g ref={arrowRef}>
          <path
            className="mm-cam"
            d="M 0 -6 L 4 5 L 0 2 L -4 5 Z"
            stroke="var(--surface-solid)"
            strokeWidth={0.75}
          />
        </g>
      </svg>
    </div>
  )
}
