import { useFeature } from '../../features/useFeature'
import {
  WALK_EYE_MAX,
  WALK_EYE_MIN,
  WALK_FOV_MAX,
  WALK_FOV_MIN,
} from '../../scene/cameras/walkCameraSettings'
import { useStore } from '../../state/store'
import { formatLength } from '../../utils/measurement'

/**
 * Walk-mode observer camera controls (Sweet Home 3D parity, PARITY-WALKCAM):
 * field-of-view + eye-height sliders, shown while in first-person walk mode.
 * Gated by the `walkCameraControls` flag (pro tier). Token-class styled so it
 * works in light/dark across all themes, and pointer/touch friendly — it sits in
 * the top-right, clear of the bottom-left joystick and the bottom-centre HUD, and
 * stops propagation so a drag on a slider never reaches the canvas drag-to-look.
 * Eye-height respects the metric/imperial unit preference.
 */
export function WalkCameraControls() {
  const enabled = useFeature('walkCameraControls')
  const cameraMode = useStore((s) => s.cameraMode)
  const walkFov = useStore((s) => s.walkFov)
  const walkEyeHeight = useStore((s) => s.walkEyeHeight)
  const setWalkFov = useStore((s) => s.setWalkFov)
  const setWalkEyeHeight = useStore((s) => s.setWalkEyeHeight)
  const units = useStore((s) => s.units)

  if (!enabled || cameraMode !== 'firstPerson') return null

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className="walk-cam-controls panel"
      onPointerDown={stop}
      onPointerMove={stop}
      onClick={stop}
      onTouchStart={stop}
    >
      <label className="walk-cam-row">
        <span className="walk-cam-lbl">Field of view</span>
        <input
          type="range"
          className="slider"
          min={WALK_FOV_MIN}
          max={WALK_FOV_MAX}
          step={1}
          value={walkFov}
          aria-label="Field of view (degrees)"
          onChange={(e) => setWalkFov(Number(e.target.value))}
        />
        <span className="walk-cam-val mono">{Math.round(walkFov)}°</span>
      </label>
      <label className="walk-cam-row">
        <span className="walk-cam-lbl">Eye height</span>
        <input
          type="range"
          className="slider"
          min={WALK_EYE_MIN}
          max={WALK_EYE_MAX}
          step={0.05}
          value={walkEyeHeight}
          aria-label="Eye height"
          onChange={(e) => setWalkEyeHeight(Number(e.target.value))}
        />
        <span className="walk-cam-val mono">{formatLength(walkEyeHeight, units)}</span>
      </label>
    </div>
  )
}
