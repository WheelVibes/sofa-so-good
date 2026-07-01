import type React from 'react'
import type { PanoTourStop } from '../../../panorama/panoTour'

interface TourStopsLayerProps {
  stops: PanoTourStop[]
  editMode: 'view' | 'edit'
  toPx: (m: number) => number
  svgRef: React.RefObject<SVGSVGElement | null>
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingStop: (v: { id: string; gx: number; gz: number }) => void
}

/**
 * The 360° **tour stop markers** layer of the 2D plan SVG (panoTour feature,
 * plan-based placement) — numbered eye-shaped pins. Ground-level stops drag to
 * reposition (edit mode); stops on other storeys render greyed and inert.
 * Extracted verbatim from `FloorPlanEditor` as behaviour-preserving code-motion
 * (MOD-FPE-SPLIT); the parent still gates the whole layer on the `panoTour` flag.
 */
export function TourStopsLayer({
  stops,
  editMode,
  toPx,
  svgRef,
  pointerWorld,
  setMovingStop,
}: TourStopsLayerProps) {
  return (
    <>
      {stops.map((s, i) => {
        const [sx, sz] = s.position
        const isGround = !s.levelId
        return (
          <g
            key={s.id}
            style={{ cursor: isGround ? 'grab' : 'default' }}
            onPointerDown={
              isGround
                ? (e) => {
                    if (e.button !== 0) return
                    if (editMode !== 'edit') return // view mode: let it pan
                    e.stopPropagation()
                    const [wx, wz] = pointerWorld(e)
                    setMovingStop({ id: s.id, gx: wx - sx, gz: wz - sz })
                    svgRef.current?.setPointerCapture(e.pointerId)
                  }
                : undefined
            }
          >
            {/* Outer ring */}
            <circle
              cx={toPx(sx)}
              cy={toPx(sz)}
              r={10}
              fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
              fillOpacity={0.18}
              stroke={isGround ? 'var(--accent)' : 'var(--text-3)'}
              strokeWidth={1.5}
            />
            {/* Inner filled dot */}
            <circle
              cx={toPx(sx)}
              cy={toPx(sz)}
              r={4}
              fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
            />
            {/* Stop number */}
            <text
              x={toPx(sx) + 13}
              y={toPx(sz)}
              dominantBaseline="middle"
              fill={isGround ? 'var(--accent)' : 'var(--text-3)'}
              style={{ fontSize: 10, fontWeight: 700, pointerEvents: 'none' }}
            >
              {i + 1}
            </text>
          </g>
        )
      })}
    </>
  )
}
