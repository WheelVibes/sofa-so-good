import type { MeasurementAnnotation } from '../../../../state/slices/measurementsSlice'
import {
  formatArea,
  formatDims,
  formatLength,
  type UnitSystem,
} from '../../../../utils/measurement'

interface AnnotationsLayerProps {
  annotations: MeasurementAnnotation[]
  toPx: (m: number) => number
  PX: number
  units: UnitSystem
}

/**
 * Pinned dimension annotations (rect area / line length) — the same callouts
 * shown in 3D and the PDF report, so a measurement traced in either view
 * appears here too. Extracted verbatim from `FloorPlanEditor` as
 * behaviour-preserving code-motion (REFAC-2).
 */
export function AnnotationsLayer({ annotations, toPx, PX, units }: AnnotationsLayerProps) {
  return (
    <>
      {annotations.map((an) => {
        const [ax, az] = an.a
        const [bx, bz] = an.b
        if (an.shape === 'rect') {
          const x = Math.min(ax, bx)
          const z = Math.min(az, bz)
          const w = Math.abs(bx - ax)
          const h = Math.abs(bz - az)
          if (w < 1e-3 || h < 1e-3) return null
          return (
            <g key={an.id} style={{ pointerEvents: 'none' }}>
              <rect
                x={toPx(x)}
                y={toPx(z)}
                width={w * PX}
                height={h * PX}
                fill="var(--plan-annot)"
                fillOpacity={0.1}
                stroke="var(--plan-annot)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
              <text
                x={toPx(x + w / 2)}
                y={toPx(z + h / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--plan-annot)"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {`${formatDims(w, h, units)} · ${formatArea(w * h, units)}`}
              </text>
            </g>
          )
        }
        const len = Math.hypot(bx - ax, bz - az)
        if (len < 1e-3) return null
        return (
          <g key={an.id} style={{ pointerEvents: 'none' }}>
            <line
              x1={toPx(ax)}
              y1={toPx(az)}
              x2={toPx(bx)}
              y2={toPx(bz)}
              stroke="var(--plan-annot)"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
            <text
              x={toPx((ax + bx) / 2)}
              y={toPx((az + bz) / 2) - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--plan-annot)"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              {formatLength(len, units)}
            </text>
          </g>
        )
      })}
    </>
  )
}
