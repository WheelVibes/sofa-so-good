import type { PlanDimension } from '../../../../floorplan/types'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import { formatLength, type UnitSystem } from '../../../../utils/measurement'
import type { Tool } from '../planConstants'

interface DimensionsLayerProps {
  /** Dimensions for the active storey (pre-filtered by level). */
  dimensions: PlanDimension[]
  sel: PlanSelection
  toPx: (m: number) => number
  tool: Tool
  editMode: 'view' | 'edit'
  units: UnitSystem
  setMovingDimEnd: (v: { id: string; which: 'a' | 'b' }) => void
}

/**
 * The active storey's **dimension lines** layer of the 2D plan SVG — each
 * dimension (drawn with the Dimension tool) as a measured line with end ticks
 * and a length label, a fat hit target for selection, and draggable A/B
 * endpoint handles in edit mode. Extracted verbatim from `FloorPlanEditor` as
 * behaviour-preserving code-motion (MOD-FPE-SPLIT).
 */
export function DimensionsLayer({
  dimensions,
  sel,
  toPx,
  tool,
  editMode,
  units,
  setMovingDimEnd,
}: DimensionsLayerProps) {
  return (
    <>
      {dimensions.map((d) => {
        const selected = sel?.type === 'dim' && sel.id === d.id
        const x1 = toPx(d.a[0])
        const y1 = toPx(d.a[1])
        const x2 = toPx(d.b[0])
        const y2 = toPx(d.b[1])
        const dx = x2 - x1
        const dy = y2 - y1
        const L = Math.hypot(dx, dy) || 1
        // Perpendicular unit (px) for end ticks + label offset.
        const px = -dy / L
        const py = dx / L
        const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1])
        const stroke = selected ? 'var(--accent)' : 'var(--text-3)'
        return (
          <g
            key={d.id}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              useStore.getState().setPlanSelection({ type: 'dim', id: d.id })
            }}
          >
            {/* Fat invisible hit target so the thin line is easy to click. */}
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={selected ? 2 : 1.5}
            />
            {/* End ticks (±6 px perpendicular). */}
            <line
              x1={x1 - px * 6}
              y1={y1 - py * 6}
              x2={x1 + px * 6}
              y2={y1 + py * 6}
              stroke={stroke}
              strokeWidth={1.5}
            />
            <line
              x1={x2 - px * 6}
              y1={y2 - py * 6}
              x2={x2 + px * 6}
              y2={y2 + py * 6}
              stroke={stroke}
              strokeWidth={1.5}
            />
            <text
              x={(x1 + x2) / 2 + px * 11}
              y={(y1 + y2) / 2 + py * 11}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                pointerEvents: 'none',
                fontSize: 11,
                fontWeight: 700,
                fill: 'var(--text)',
                paintOrder: 'stroke',
                stroke: 'var(--surface)',
                strokeWidth: 3,
                strokeLinejoin: 'round',
              }}
            >
              {formatLength(len, units)}
            </text>
            {/* Draggable endpoint handles (edit mode) — drag to reshape
                the dimension; the inspector also edits A/B + length. */}
            {selected &&
              tool === 'select' &&
              editMode === 'edit' &&
              (
                [
                  ['a', x1, y1],
                  ['b', x2, y2],
                ] as const
              ).map(([which, cx, cy]) => (
                <circle
                  key={which}
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setMovingDimEnd({ id: d.id, which })
                  }}
                />
              ))}
          </g>
        )
      })}
    </>
  )
}
