import type { PlanElectricalPoint } from '../../../../floorplan/types'
import type { FurnitureItem } from '../../../../furniture/types'

interface SwitchLinksLayerProps {
  /** The selected `switch` point, or null when the selection isn't a switch. */
  switchPoint: PlanElectricalPoint | null
  /** Placed items on the active storey (controlled light fixtures resolve
   *  against these by id). */
  items: FurnitureItem[]
  toPx: (m: number) => number
}

/**
 * Visual feedback for the lighting-switching schematic (BSJ-3, `switchCircuits`
 * pro flag): while a `switch` point is selected in MEP mode, draws a dashed
 * leader line from it to each light fixture it controls, plus a highlight ring
 * on each controlled fixture — so the owner can confirm the links spatially
 * (the on-plan complement to the inspector's room-grouped list). Renders
 * nothing when no switch is selected or it controls nothing. Follows MepLayer's
 * `--accent` selection-colour convention; `pointer-events: none` throughout so
 * it never intercepts the click that would deselect the switch.
 */
export function SwitchLinksLayer({ switchPoint, items, toPx }: SwitchLinksLayerProps) {
  if (!switchPoint?.controls || switchPoint.controls.length === 0) return null
  const byId = new Map(items.map((it) => [it.id, it]))
  const sx = toPx(switchPoint.x)
  const sz = toPx(switchPoint.z)
  const targets = switchPoint.controls
    .map((id) => byId.get(id))
    .filter((it): it is FurnitureItem => it != null)
  if (targets.length === 0) return null
  return (
    <g style={{ pointerEvents: 'none' }}>
      {targets.map((it) => {
        const tx = toPx(it.position[0])
        const tz = toPx(it.position[1])
        return (
          <g key={it.id}>
            <line
              x1={sx}
              y1={sz}
              x2={tx}
              y2={tz}
              stroke="var(--accent)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              opacity={0.9}
            />
            <circle
              cx={tx}
              cy={tz}
              r={11}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.75}
              opacity={0.9}
            />
          </g>
        )
      })}
    </g>
  )
}
