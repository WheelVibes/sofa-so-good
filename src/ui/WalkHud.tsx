import { useEffect, useState } from 'react'
import { useFeature } from '../features/useFeature'
import { requestWalkMeasurePoint } from '../scene/cameras/walkMeasureRequest'
import { useStore } from '../state/store'
import { formatLength } from '../utils/measurement'
import { InfoCallout } from './InfoCallout'
import { Icon } from './toolbar/icons'

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
  // Walk-mode point-to-point measure (WALK-MEASURE): the touch-parity
  // counterpart to the `walkMeasurePoint` (G) keybinding — walk mode on touch
  // has no keyboard, so this button is the only way to place a point there.
  // Shown on both platforms for consistency (mirrors every other walk-mode
  // affordance having both a key and a HUD control).
  const measureEnabled = useFeature('walkMeasure')
  const measureA = useStore((s) => s.walkMeasureA)
  const measureB = useStore((s) => s.walkMeasureB)
  const measureLive = useStore((s) => s.walkMeasureLive)
  const clearWalkMeasure = useStore((s) => s.clearWalkMeasure)
  const units = useStore((s) => s.units)
  const measureEnd = measureB ?? measureLive
  const measureDist =
    measureA && measureEnd
      ? Math.hypot(
          measureEnd[0] - measureA[0],
          measureEnd[1] - measureA[1],
          measureEnd[2] - measureA[2],
        )
      : null

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
    <>
      {/* Info callout: top-centre, tucked below the mobile home/menu buttons so
          the bottom-left joystick never covers it (matches the room-editor hint). */}
      <div
        className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 104px)' }}
      >
        <div className="pointer-events-auto">
          <InfoCallout id="walk-mode" title="Walking through">
            Move around to see your home at eye level. Leave walk mode to keep editing.
          </InfoCallout>
        </div>
      </div>
      {/* Walk-measure control: top-right, persistent (not auto-fading like the
          controls banner below — it's an active tool, not a one-time hint). */}
      {measureEnabled ? (
        <div className="walk-measure-dock pointer-events-none">
          <div className="walk-measure pointer-events-auto">
            <button
              type="button"
              className="wm-btn"
              onClick={() => requestWalkMeasurePoint()}
              aria-label={
                !measureA
                  ? 'Set first measure point'
                  : !measureB
                    ? 'Set second measure point'
                    : 'Start a new measurement'
              }
            >
              <Icon.Tape width={16} height={16} />
              {!measureA ? 'Measure' : !measureB ? 'Set point' : 'New'}
            </button>
            {measureDist !== null ? (
              <span className="wm-dist">{formatLength(measureDist, units)}</span>
            ) : null}
            {measureA ? (
              <button
                type="button"
                className="wm-clear"
                aria-label="Clear measurement"
                onClick={() => clearWalkMeasure()}
              >
                <Icon.Close width={14} height={14} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* Controls banner: bottom-centre, clear of the home indicator (safe-area).
          When the touch joystick is present it sits bottom-left, so lift the
          banner above it (joystick = 24px inset + 88px tall) to avoid the overlap
          on narrow screens; on desktop it stays just above the safe-area.
          `.walk-hud-dock`: on mobile the shell extends below the viewport
          (iOS full-bleed), so responsive.css re-anchors this wrapper (and the
          joystick) with `position: fixed` to keep it above the home indicator. */}
      <div
        className="walk-hud-dock pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 flex-col items-center"
        style={{
          bottom: IS_COARSE_POINTER
            ? 'calc(env(safe-area-inset-bottom, 0px) + 124px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
      >
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
    </>
  )
}
