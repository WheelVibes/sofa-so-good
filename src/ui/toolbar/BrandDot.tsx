import { useStore } from '../../state/store'
import { BrandMark } from '../Logo'
import { confirmReturnToOrbit } from '../returnToOrbit'

/**
 * The Sofa So Good brand mark in the toolbar. On the default orbit-overview
 * screen it's an inert badge; on any other screen (walk / room editor /
 * floor-plan editor) it becomes a button that confirms and returns to the orbit
 * overview — a familiar "home" affordance.
 */
export function BrandDot({ size = 22 }: { size?: number }) {
  const inOverview = useStore(
    (s) => s.cameraMode === 'orbit' && !s.roomEditor.active && !s.floorPlanEditing,
  )
  if (inOverview) {
    return (
      <div className="brand-dot" title="Sofa So Good">
        <BrandMark size={size} />
      </div>
    )
  }
  return (
    <button
      type="button"
      className="brand-dot"
      title="Return to orbit mode"
      aria-label="Return to orbit mode"
      onClick={() => void confirmReturnToOrbit()}
    >
      <BrandMark size={size} />
    </button>
  )
}
