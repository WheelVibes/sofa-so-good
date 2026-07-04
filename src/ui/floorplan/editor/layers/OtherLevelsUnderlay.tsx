import type { PlanLevel } from '../../../../floorplan/levels'
import { wallLength } from '../../../../floorplan/types'

interface OtherLevelsUnderlayProps {
  /** Every storey other than the active one. */
  levels: PlanLevel[]
  toPx: (m: number) => number
}

/**
 * Other storeys' walls as a dimmed, non-interactive underlay (SH3D "all
 * levels"), so walls/stairs can be lined up between floors. Extracted
 * verbatim from `FloorPlanEditor` as behaviour-preserving code-motion
 * (REFAC-2).
 */
export function OtherLevelsUnderlay({ levels, toPx }: OtherLevelsUnderlayProps) {
  return (
    <>
      {levels.flatMap((lvl) =>
        lvl.walls
          .filter((w) => wallLength(w) > 0)
          .map((w) => (
            <line
              key={`ghost-${lvl.id}-${w.id}`}
              x1={toPx(w.start[0])}
              y1={toPx(w.start[1])}
              x2={toPx(w.end[0])}
              y2={toPx(w.end[1])}
              stroke="var(--text-3)"
              strokeWidth={w.thickness === 'external' ? 4 : 2.5}
              strokeLinecap="round"
              opacity={0.16}
              style={{ pointerEvents: 'none' }}
            />
          )),
      )}
    </>
  )
}
