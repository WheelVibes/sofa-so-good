import type React from 'react'
import type { PlanWall } from '../../../../floorplan/types'

interface WallHandlesLayerProps {
  /** The selected wall (or null/undefined/locked → renders nothing). */
  wall: PlanWall | null | undefined
  toPx: (m: number) => number
  svgRef: React.RefObject<SVGSVGElement | null>
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingVertex: (v: { id: string; which: 'start' | 'end' }) => void
  setRotatingWall: (v: {
    id: string
    cx: number
    cz: number
    s0: [number, number]
    e0: [number, number]
    a0: number
  }) => void
}

/**
 * The **selected-wall reshape handles** of the 2D plan SVG — the two endpoint
 * grab dots (drag to extend/shorten) and the rotation ring + knob (drag to spin
 * the wall about its centre). Extracted verbatim from `FloorPlanEditor` as
 * behaviour-preserving code-motion (MOD-FPE-SPLIT); the parent still gates on
 * edit mode + select tool + a selected wall.
 */
export function WallHandlesLayer({
  wall,
  toPx,
  svgRef,
  pointerWorld,
  setMovingVertex,
  setRotatingWall,
}: WallHandlesLayerProps) {
  if (!wall || wall.locked) return null // locked: no reshape/rotate handles
  const w = wall
  const sx = toPx(w.start[0])
  const sy = toPx(w.start[1])
  const ex = toPx(w.end[0])
  const ey = toPx(w.end[1])
  const mpx = (sx + ex) / 2
  const mpy = (sy + ey) / 2
  const L = Math.hypot(ex - sx, ey - sy) || 1
  const npx = -(ey - sy) / L
  const npy = (ex - sx) / L
  // Rotation ring radius — encircles the wall (like the furniture rotate gizmo),
  // with a floor so short walls still get a grabbable ring.
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
      {/* Rotation ring — grab anywhere on the ring (or its knob) to rotate the
        wall about its centre. A fat transparent ring makes the stroke easy to
        grab; `pointerEvents: 'stroke'` keeps the interior click-through. */}
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
}
