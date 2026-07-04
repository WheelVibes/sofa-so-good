import { doorSwing } from '../../../../floorplan/doorSwing'
import type { PlanOpening, PlanWall } from '../../../../floorplan/types'
import { wallLength } from '../../../../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../../../../floorplan/wallArc'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { formatLength, type UnitSystem } from '../../../../utils/measurement'
import { showOpeningDim, showWallDim } from '../planLabelDisplay'
import { WallDimension } from '../WallDimension'

interface PersistentDimensionsLayerProps {
  /** The "Dims" toolbar toggle — both wall + opening callouts share it. */
  show: boolean
  walls: PlanWall[]
  openings: PlanOpening[]
  sel: PlanSelection
  toPx: (m: number) => number
  PX: number
  units: UnitSystem
  isMobile: boolean
  /** Plan centre in screen px — dimension callouts orient away from it. */
  centre: [number, number]
  fontPx: number
}

/**
 * Persistent wall-length + opening-width dimension callouts (the "Dims"
 * toolbar toggle) — a staple of pro floor planners: a proper dimension line
 * with extension lines + arrowheads spanning each wall/opening, oriented to
 * the plan's outside, culled to fit the available screen space. Extracted
 * verbatim from `FloorPlanEditor` as behaviour-preserving code-motion
 * (REFAC-2).
 */
export function PersistentDimensionsLayer({
  show,
  walls,
  openings,
  sel,
  toPx,
  PX,
  units,
  isMobile,
  centre,
  fontPx,
}: PersistentDimensionsLayerProps) {
  if (!show) return null
  return (
    <>
      {walls.map((w) => {
        const len = wallLength(w)
        if (!showWallDim(len, PX)) return null
        return (
          <WallDimension
            key={`dim-${w.id}`}
            a={w.start}
            b={w.end}
            label={formatLength(len, units)}
            toPx={toPx}
            centre={centre}
            fontPx={fontPx}
            selected={sel?.type === 'wall' && sel.id === w.id}
          />
        )
      })}

      {/* Opening (door/window) width dimensions — same "Dims" toggle. Curved
          walls keep a plain label (a straight marker can't follow the arc). */}
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        if (!wall) return null
        const len = wallLength(wall)
        if (len === 0) return null
        // Least-important, most-numerous labels — drop when they can't fit
        // (and sooner on mobile) to keep the plan readable.
        if (!showOpeningDim(o.width, PX, isMobile)) return null
        const isSel = sel?.type === 'opening' && sel.id === o.id
        if (isCurvedWall(wall)) {
          const p = pointAtArcLength(wall, o.offset + o.width / 2)
          const ux = Math.sin(p.angle)
          const uz = Math.cos(p.angle)
          const off = o.kind === 'door' && doorSwing(o) === 'right' ? -0.32 : 0.32
          return (
            <text
              key={`odim-${o.id}`}
              x={toPx(p.x - uz * off)}
              y={toPx(p.z + ux * off)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="plan-dim-label"
              fill={isSel ? 'var(--accent)' : 'var(--accent-soft-text)'}
              style={{ pointerEvents: 'none', fontSize: fontPx, fontWeight: 600 }}
            >
              {formatLength(o.width, units)}
            </text>
          )
        }
        const ux = (wall.end[0] - wall.start[0]) / len
        const uz = (wall.end[1] - wall.start[1]) / len
        return (
          <WallDimension
            key={`odim-${o.id}`}
            a={[wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]}
            b={[
              wall.start[0] + ux * (o.offset + o.width),
              wall.start[1] + uz * (o.offset + o.width),
            ]}
            label={formatLength(o.width, units)}
            toPx={toPx}
            centre={centre}
            fontPx={fontPx}
            selected={isSel}
          />
        )
      })}
    </>
  )
}
