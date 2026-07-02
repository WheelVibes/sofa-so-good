import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { InfoCallout } from './InfoCallout'

/** True on touch-primary devices, where Pointer Lock is unavailable and the
 * on-screen joystick + canvas drag-to-look drive the camera instead. Mirrors
 * the same check in FirstPersonCamera / WalkJoystick. */
const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Themed walk-mode controls banner. Shown on entering first-person walk, then
 * auto-fades after a few seconds. Purely informational: on desktop the
 * browser's own pointer-lock notice ("Press Esc to show your cursor") is
 * browser chrome and cannot be styled or suppressed, so this gives an on-brand
 * controls hint that reframes it — and stays discoverable for first-time users.
 * Wording adapts to the input model (touch joystick+drag vs mouse pointer-lock).
 * Non-interactive.
 */
export function WalkHud() {
  const cameraMode = useStore((s) => s.cameraMode)
  const walking = cameraMode === 'firstPerson'
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!walking) {
      setVisible(false)
      return
    }
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(t)
  }, [walking])

  if (!walking) return null
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="pointer-events-auto">
        <InfoCallout id="walk-mode" title="Walking through">
          Move around to see your home at eye level. Leave walk mode to keep editing.
        </InfoCallout>
      </div>
      <div className={`walk-hud${visible ? '' : ' is-hidden'}`}>
        <span className="walk-hud-title">Walk mode</span>
        <span className="walk-hud-sep" />
        {IS_COARSE_POINTER ? (
          <>
            <span className="walk-hud-grp">
              <kbd>Joystick</kbd> to move
            </span>
            <span className="walk-hud-grp">
              <kbd>Drag</kbd> to look
            </span>
          </>
        ) : (
          <>
            <span className="walk-hud-grp">
              <kbd>Click</kbd> to look
            </span>
            <span className="walk-hud-grp">
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move
            </span>
            <span className="walk-hud-grp">
              <kbd>Esc</kbd> show cursor
            </span>
          </>
        )}
      </div>
    </div>
  )
}
