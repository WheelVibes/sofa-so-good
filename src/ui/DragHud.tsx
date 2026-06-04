import { CLEARANCE } from '../layout/designRules'
import { useStore } from '../state/store'

/**
 * Small heads-up readout shown while dragging a single item: its live distance
 * to the nearest wall. Turns amber below the minimum walkway clearance, so it's
 * easy to keep circulation gaps. Bottom-centre, non-interactive.
 */
export function DragHud() {
  const dragging = useStore((s) => s.draggingItemId)
  const groupSize = useStore((s) => s.dragGroupOriginals.length)
  const gap = useStore((s) => s.dragClearance)

  if (!dragging || groupSize > 1 || gap == null) return null
  const tight = gap < CLEARANCE.walkwayMin
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
      <div className={`hud-pill${tight ? ' warn' : ''}`}>
        ↔ Wall clearance: <span className="mono">{gap.toFixed(2)} m</span>
        {tight ? ' · tight' : ''}
      </div>
    </div>
  )
}
