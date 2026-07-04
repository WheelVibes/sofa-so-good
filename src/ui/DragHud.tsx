import type { WallGaps } from '../collision/clearanceGap'
import { CLEARANCE } from '../layout/designRules'
import { useStore } from '../state/store'
import type { UnitSystem } from '../utils/measurement'
import { formatLength } from '../utils/measurement'

/** Sides in display order, each with its arrow glyph + accessible label. The
 *  arrows read as "gap toward this wall" from the dragged item's point of view. */
const SIDES: Array<{ key: keyof WallGaps; arrow: string; label: string }> = [
  { key: 'left', arrow: '←', label: 'left wall' },
  { key: 'right', arrow: '→', label: 'right wall' },
  { key: 'back', arrow: '↑', label: 'back wall' },
  { key: 'front', arrow: '↓', label: 'front wall' },
]

function gapChips(gaps: WallGaps, units: UnitSystem) {
  return SIDES.flatMap(({ key, arrow, label }) => {
    const v = gaps[key]
    if (v == null) return []
    const tight = v < CLEARANCE.walkwayMin
    return [
      <span key={key} className={`drag-gap${tight ? ' warn' : ''}`} role="img" aria-label={label}>
        <span aria-hidden="true">{arrow}</span>
        <span className="mono">{formatLength(v, units)}</span>
      </span>,
    ]
  })
}

/**
 * Heads-up readout shown while dragging a single item: its live distance to the
 * nearest wall on each side (left/right/back/front), so a piece can be placed to
 * a precise gap. Each side turns amber below the minimum walkway clearance. Falls
 * back to the single nearest-wall gap when no per-side detail is available.
 * Bottom-centre, non-interactive; wraps on narrow viewports.
 */
export function DragHud() {
  const dragging = useStore((s) => s.draggingItemId)
  const groupSize = useStore((s) => s.dragGroupOriginals.length)
  const gaps = useStore((s) => s.dragWallGaps)
  const gap = useStore((s) => s.dragClearance)
  const units = useStore((s) => s.units)

  if (!dragging || groupSize > 1) return null

  const chips = gaps ? gapChips(gaps, units) : []
  // Nothing faces the item on any side: fall back to the single nearest gap, or
  // hide entirely when there's no wall to measure to.
  if (chips.length === 0) {
    if (gap == null) return null
    const tight = gap < CLEARANCE.walkwayMin
    return (
      <div className="drag-readout pointer-events-none absolute left-1/2 z-20 -translate-x-1/2">
        <div className={`hud-pill${tight ? ' warn' : ''}`}>
          ↔ Wall clearance: <span className="mono">{formatLength(gap, units)}</span>
          {tight ? ' · tight' : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
      <div className="hud-pill drag-gaps">
        <span className="drag-gaps-label">Wall gap</span>
        {chips}
      </div>
    </div>
  )
}
