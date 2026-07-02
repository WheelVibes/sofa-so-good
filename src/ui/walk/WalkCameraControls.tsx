import { useFeature } from '../../features/useFeature'
import {
  WALK_EYE_MAX,
  WALK_EYE_MIN,
  WALK_FOV_MAX,
  WALK_FOV_MIN,
} from '../../scene/cameras/walkCameraSettings'
import { useStore } from '../../state/store'
import { formatLength } from '../../utils/measurement'
import { SliderField } from '../controls/SliderField'

/**
 * Walk-mode observer camera settings (Sweet Home 3D parity, PARITY-WALKCAM):
 * field-of-view + eye-height sliders. Rendered as a **"Walk settings"** section
 * inside the Appearance & help popover (so it's tucked away, not floating over
 * the walk view) and only while in first-person walk mode. Gated by the
 * `walkCameraControls` flag (pro tier). Token-class styled so it works in
 * light/dark across all themes; eye-height respects the unit preference.
 */
export function WalkSettings() {
  const enabled = useFeature('walkCameraControls')
  const cameraMode = useStore((s) => s.cameraMode)
  const walkFov = useStore((s) => s.walkFov)
  const walkEyeHeight = useStore((s) => s.walkEyeHeight)
  const setWalkFov = useStore((s) => s.setWalkFov)
  const setWalkEyeHeight = useStore((s) => s.setWalkEyeHeight)
  const units = useStore((s) => s.units)

  if (!enabled || cameraMode !== 'firstPerson') return null

  return (
    <>
      <div className="pop-label" style={{ marginTop: 10 }}>
        Walk settings
      </div>
      <SliderField
        label="Field of view"
        ariaLabel="Field of view (degrees)"
        min={WALK_FOV_MIN}
        max={WALK_FOV_MAX}
        step={1}
        value={walkFov}
        onChange={setWalkFov}
        format={(v) => `${Math.round(v)}°`}
      />
      <SliderField
        label="Eye height"
        min={WALK_EYE_MIN}
        max={WALK_EYE_MAX}
        step={0.05}
        value={walkEyeHeight}
        onChange={setWalkEyeHeight}
        format={(v) => formatLength(v, units)}
      />
    </>
  )
}
