import type { PlanGuide } from '../../../../floorplan/types'

interface PlanGuidesLayerProps {
  guides: PlanGuide[]
  toPx: (m: number) => number
  W: number
  H: number
  onRemoveGuide: (index: number) => void
}

/**
 * Persistent ruler guides (PARITY-PLAN-GUIDES) — dashed accent lines spanning
 * the canvas that points snap to; click one to remove it. Extracted verbatim
 * from `FloorPlanEditor` as behaviour-preserving code-motion (REFAC-2).
 */
export function PlanGuidesLayer({ guides, toPx, W, H, onRemoveGuide }: PlanGuidesLayerProps) {
  return (
    <>
      {guides.map((g, i) => {
        const p = toPx(g.pos)
        const x1 = g.axis === 'x' ? p : 0
        const x2 = g.axis === 'x' ? p : W
        const y1 = g.axis === 'x' ? 0 : p
        const y2 = g.axis === 'x' ? H : p
        return (
          <g key={`guide-${g.axis}-${i}`} style={{ cursor: 'pointer' }}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={10}
              onPointerDown={(e) => {
                e.stopPropagation()
                onRemoveGuide(i)
              }}
            >
              <title>Click to remove guide</title>
            </line>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="6 4"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}
    </>
  )
}
