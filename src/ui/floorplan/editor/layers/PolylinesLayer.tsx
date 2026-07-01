import { polylinePointsAttr } from '../../../../floorplan/polyline'
import type { PlanPolyline } from '../../../../floorplan/types'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import type { Tool } from '../planConstants'

interface PolylinesLayerProps {
  /** Polyline annotations for the active storey (pre-filtered by level). */
  polylines: PlanPolyline[]
  sel: PlanSelection
  toPx: (m: number) => number
  tool: Tool
}

/**
 * The active storey's **polyline annotations** layer of the 2D plan SVG — each
 * open/closed path drawn with the Polyline tool, optionally dashed, with an
 * end arrowhead on open paths, a fat hit target, and click-to-select. Extracted
 * verbatim from `FloorPlanEditor` as behaviour-preserving code-motion
 * (MOD-FPE-SPLIT).
 */
export function PolylinesLayer({ polylines, sel, toPx, tool }: PolylinesLayerProps) {
  return (
    <>
      {polylines.map((p) => {
        const selected = sel?.type === 'polyline' && sel.id === p.id
        const project = ([x, z]: [number, number]): [number, number] => [toPx(x), toPx(z)]
        const ptsAttr = polylinePointsAttr(p.points, project)
        const stroke = selected ? 'var(--accent)' : 'var(--text-2)'
        const Shape = p.closed ? 'polygon' : 'polyline'
        // Arrowhead at the final point of an open path: a small filled
        // triangle aligned with the last segment's direction.
        let arrowPts: string | null = null
        if (p.arrow && !p.closed && p.points.length >= 2) {
          const [ex, ey] = project(p.points[p.points.length - 1])
          const [sx, sy] = project(p.points[p.points.length - 2])
          const dx = ex - sx
          const dy = ey - sy
          const L = Math.hypot(dx, dy) || 1
          const ux = dx / L
          const uy = dy / L
          const size = 11
          const bx = ex - ux * size
          const by = ey - uy * size
          const nx = -uy
          const ny = ux
          arrowPts = `${ex},${ey} ${bx + nx * size * 0.45},${by + ny * size * 0.45} ${bx - nx * size * 0.45},${by - ny * size * 0.45}`
        }
        return (
          <g
            key={p.id}
            style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
            onPointerDown={(e) => {
              if (tool !== 'select') return
              e.stopPropagation()
              useStore.getState().setPlanSelection({ type: 'polyline', id: p.id })
            }}
          >
            {/* Fat invisible hit target so the thin path is easy to click. */}
            <Shape points={ptsAttr} fill="none" stroke="transparent" strokeWidth={12} />
            <Shape
              points={ptsAttr}
              fill="none"
              stroke={stroke}
              strokeWidth={selected ? 2.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={p.dashed ? '6 4' : undefined}
            />
            {arrowPts && <polygon points={arrowPts} fill={stroke} />}
          </g>
        )
      })}
    </>
  )
}
