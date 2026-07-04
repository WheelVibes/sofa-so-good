import { useStore } from '../state/store'

/**
 * Walk-mode aiming reticle, centred over the canvas. Styled entirely via the
 * `.walk-reticle` class (`app.css`): a light mark paired with a dark halo so it
 * stays legible over ANY 3D background — a bright wall, a dark night scene, or a
 * mid-grey surface where the old `mix-blend-difference` mark collapsed into the
 * background. Non-interactive.
 */
export function Crosshair() {
  const cameraMode = useStore((s) => s.cameraMode)
  if (cameraMode !== 'firstPerson') return null
  return (
    <div className="walk-reticle" aria-hidden>
      <span className="rt" />
    </div>
  )
}
