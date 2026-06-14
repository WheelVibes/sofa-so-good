import { useEffect, useRef, useState } from 'react'
import { cameraForwardXZ } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { compassNeedleDeg, forwardToHeadingDeg } from './compassHeading'
import { Minimap } from './Minimap'
import { Icon } from './toolbar/icons'
import { Tooltip } from './toolbar/Tooltip'

/** Dispatch a wheel event on the R3F canvas so OrbitControls dollies the
 *  camera. Positive deltaY = zoom out, negative = zoom in. */
function dolly(deltaY: number) {
  const canvas = document.querySelector('canvas')
  if (!canvas) return
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

/** Bottom-right navigation cluster: minimap (walk only) + a single vertical
 *  control fusing the compass into the top of the zoom rail, matching the
 *  design's `.navcluster`. */
export function NavCluster() {
  const cameraMode = useStore((s) => s.cameraMode)
  const requestHomeView = useStore((s) => s.requestHomeView)
  // Scene North orientation — the needle must point to true North, not just the
  // camera heading, so it agrees with the 2D plan compass when North is rotated.
  const orientationDeg = useStore((s) => s.orientationDeg)
  const [heading, setHeading] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const tick = () => {
      const next = forwardToHeadingDeg(cameraForwardXZ.x, cameraForwardXZ.z)
      setHeading((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const orbit = cameraMode === 'orbit'

  return (
    <div className="navcluster">
      <Minimap />
      <div className="zoom">
        <Tooltip label="Reset view" shortcut="H">
          <button
            type="button"
            className="compass-cell"
            aria-label="Compass — reset view"
            onClick={() => requestHomeView()}
          >
            <span className="cc-n">N</span>
            <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
              <g transform={`rotate(${compassNeedleDeg(heading, orientationDeg)} 12 12)`}>
                <polygon points="12,3 9,13 12,11 15,13" fill="var(--accent)" />
                <polygon points="12,21 9,11 12,13 15,11" fill="var(--text-3)" />
              </g>
            </svg>
          </button>
        </Tooltip>
        {orbit ? (
          <>
            <div className="div" />
            <Tooltip label="Zoom in" shortcut="">
              <button type="button" aria-label="Zoom in" onClick={() => dolly(-240)}>
                <Icon.Plus width={18} height={18} />
              </button>
            </Tooltip>
            <div className="div" />
            <Tooltip label="Zoom out" shortcut="">
              <button type="button" aria-label="Zoom out" onClick={() => dolly(240)}>
                <Icon.Minus width={18} height={18} />
              </button>
            </Tooltip>
            <div className="div" />
            <Tooltip label="Reset view" shortcut="H">
              <button type="button" aria-label="Reset view" onClick={() => requestHomeView()}>
                <Icon.Home width={18} height={18} />
              </button>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  )
}
