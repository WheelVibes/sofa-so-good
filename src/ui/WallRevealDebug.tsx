import { useEffect, useRef, useState } from 'react'
import { ROOMS, WALLS } from '../apartment/constants'
import { wallThicknessMetres } from '../apartment/wallSegments'
import { getWallOpacity } from '../apartment/walls/wallReveal'
import {
  orientOutward,
  pointInRooms,
  type RoomRect,
  wallRevealFactor,
} from '../apartment/walls/wallRevealMath'
import { cameraPosXZ } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'

// Diagnostic overlay (opt-in via `?walldbg=1`) for the orbit dollhouse wall
// reveal. Lists every exterior wall with the opacity the renderer is actually
// applying (published by WallSegment) alongside the reveal factor recomputed
// from the live camera position — so a single screenshot shows, for the wall
// you're facing, whether the fade is firing (factor → 0, opacity → 0.15) or
// not. Not a user feature: zero footprint unless the flag is present.

const ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('walldbg')

const ROOM_RECTS: RoomRect[] = Object.values(ROOMS).map((r) => ({
  x: r.origin[0],
  z: r.origin[1],
  w: r.width,
  d: r.depth,
  ext: r.extension
    ? {
        x: r.origin[0] + r.extension.offset[0],
        z: r.origin[1] + r.extension.offset[1],
        w: r.extension.width,
        d: r.extension.depth,
      }
    : undefined,
}))
const isInterior = (x: number, z: number) => pointInRooms(x, z, ROOM_RECTS, 0.05)

const EXT_WALLS = WALLS.filter((w) => w.thickness === 'external').map((w) => {
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz) || 1
  const mx = (w.start[0] + w.end[0]) / 2
  const mz = (w.start[1] + w.end[1]) / 2
  const probe = wallThicknessMetres(w) / 2 + 0.3
  const out = orientOutward(mx, mz, -dz / len, dx / len, isInterior, probe)
  return { id: w.id, mx, mz, out }
})

export function WallRevealDebug() {
  const cameraMode = useStore((s) => s.cameraMode)
  const [, setTick] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (!ENABLED) return
    const loop = () => {
      setTick((t) => (t + 1) % 1000)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [])
  if (!ENABLED) return null

  const cx = cameraPosXZ.x
  const cz = cameraPosXZ.z
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 9999,
        font: '11px/1.35 ui-monospace, monospace',
        background: 'rgba(0,0,0,0.78)',
        color: '#e8e8e8',
        padding: '8px 10px',
        borderRadius: 6,
        pointerEvents: 'none',
        maxHeight: '90vh',
        overflow: 'auto',
      }}
    >
      <div style={{ marginBottom: 4 }}>
        mode={cameraMode} cam=({cx.toFixed(2)}, {cz.toFixed(2)})
      </div>
      {EXT_WALLS.map((w) => {
        const opacity = getWallOpacity(w.id)
        const factor = w.out ? wallRevealFactor(cx, cz, w.mx, w.mz, w.out.nx, w.out.nz) : null
        const faded = opacity < 0.6
        return (
          <div key={w.id} style={{ color: faded ? '#7ee787' : '#e8e8e8' }}>
            {w.id.replace('wall-ext-', '')}: op={opacity.toFixed(2)} f=
            {factor == null ? 'n/a' : factor.toFixed(2)}
          </div>
        )
      })}
    </div>
  )
}
