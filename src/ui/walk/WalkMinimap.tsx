import { useEffect, useMemo, useRef } from 'react'
import { planBounds, pointInRoom, wallLength } from '../../floorplan/types'
import { cameraForwardXZ, cameraPosXZ } from '../../scene/cameras/cameraForward'
import { useStore } from '../../state/store'

/**
 * A small top-down minimap shown in Walk mode so you can orient yourself in the
 * flat — the plan outline + a live player marker (position + facing). Pure DOM/
 * SVG overlay (bottom-right, clear of the bottom-left joystick), updated via a
 * lightweight rAF that only writes the marker's transform (the walls SVG is
 * static). Hidden outside walk mode.
 */
export function WalkMinimap() {
  const cameraMode = useStore((s) => s.cameraMode)
  const plan = useStore((s) => s.floorPlan)
  const markerRef = useRef<SVGGElement>(null)
  const roomLabelRef = useRef<HTMLDivElement>(null)

  const [vbW, vbH, walls] = useMemo(() => {
    const [w, d] = planBounds(plan)
    const pad = 0.4
    const segs = plan.walls
      .filter((wl) => wallLength(wl) > 0.001)
      .map(
        (wl) =>
          `<line x1="${wl.start[0].toFixed(2)}" y1="${wl.start[1].toFixed(2)}" x2="${wl.end[0].toFixed(2)}" y2="${wl.end[1].toFixed(2)}" stroke="var(--text-3)" stroke-width="${wl.thickness === 'external' ? 0.16 : 0.08}" stroke-linecap="round"/>`,
      )
      .join('')
    return [w + pad * 2, d + pad * 2, segs] as const
  }, [plan])

  // Animate only the marker transform from the live camera singletons; runs
  // only while mounted (walk mode), so it costs nothing otherwise. Also updates
  // the current-room caption (cheap point-in-room over the plan rooms), writing
  // the DOM only when it changes.
  useEffect(() => {
    if (cameraMode !== 'firstPerson') return
    let raf = 0
    let lastRoom = ''
    const tick = () => {
      const x = cameraPosXZ.x
      const z = cameraPosXZ.z
      const g = markerRef.current
      if (g) {
        // Heading: a marker pointing "up" (−y) rotated to face (fx, fz).
        const deg = (Math.atan2(cameraForwardXZ.x, -cameraForwardXZ.z) * 180) / Math.PI
        g.setAttribute('transform', `translate(${x} ${z}) rotate(${deg})`)
      }
      const cap = roomLabelRef.current
      if (cap) {
        const room =
          useStore.getState().floorPlan.rooms.find((r) => pointInRoom(r, x, z))?.name ?? ''
        if (room !== lastRoom) {
          lastRoom = room
          cap.textContent = room
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cameraMode])

  if (cameraMode !== 'firstPerson') return null

  return (
    <div
      className="walk-minimap pointer-events-none absolute z-20"
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        width: 132,
        height: 150,
        padding: 6,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--r-3, 10px)',
        background: 'var(--surface-solid)',
        opacity: 0.92,
        boxShadow: 'var(--shadow-2, 0 2px 8px rgba(0,0,0,0.2))',
        border: '1px solid var(--border)',
      }}
      aria-hidden="true"
    >
      <svg
        viewBox={`-0.4 -0.4 ${vbW.toFixed(2)} ${vbH.toFixed(2)}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', flex: 1, minHeight: 0, display: 'block' }}
      >
        {/* Static wall outline (app-built strings, no user input). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-built SVG */}
        <g dangerouslySetInnerHTML={{ __html: walls }} />
        {/* Live player marker — transform written each frame by the rAF. */}
        <g ref={markerRef}>
          <path
            d="M0,-0.45 L0.32,0.4 L0,0.2 L-0.32,0.4 Z"
            fill="var(--accent)"
            stroke="white"
            strokeWidth={0.05}
          />
        </g>
      </svg>
      {/* Current-room caption — updated by the rAF only when it changes. */}
      <div
        ref={roomLabelRef}
        style={{
          marginTop: 4,
          textAlign: 'center',
          fontSize: 'var(--t-2xs, 10px)',
          fontWeight: 600,
          color: 'var(--text-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}
