import { useSyncExternalStore } from 'react'
import { useFeature } from '../features/useFeature'
import { getResizeReadout, subscribeResizeReadout } from '../scene/selection/resizeReadoutSignal'
import { useStore } from '../state/store'
import { formatDims } from '../utils/measurement'

/**
 * Heads-up readout shown while group-resizing a multi-selection with the
 * `ResizeGizmo`: the selection bounding box's live width × depth in the user's
 * units, so a block of furniture can be scaled to a target size. A single item
 * already shows metres in the inspector's Size section, so this covers only the
 * 2+ group case that has no other size feedback.
 *
 * Bottom-centre, non-interactive; reads a module-level signal (not the store)
 * so the many-per-second resize ticks don't wake the RenderPump.
 */
export function ResizeHud() {
  const enabled = useFeature('itemDimensionReadout')
  const readout = useSyncExternalStore(subscribeResizeReadout, getResizeReadout, getResizeReadout)
  const units = useStore((s) => s.units)

  if (!enabled || !readout) return null

  return (
    <div className="drag-readout pointer-events-none absolute left-1/2 z-20 -translate-x-1/2">
      <div className="hud-pill">
        <span className="drag-gaps-label">Size</span>{' '}
        <span className="mono">{formatDims(readout.w, readout.d, units)}</span>
      </div>
    </div>
  )
}
