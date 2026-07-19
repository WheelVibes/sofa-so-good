import type { PlanWall } from '../../../../floorplan/types'
import { wallSvgPath } from '../../../../floorplan/wallArc'
import {
  type HackClass,
  hackClassDescription,
  hackClassLabel,
  wallHackability,
} from '../../../../floorplan/wallHackability'

/**
 * Class → token colour. Uses ONLY existing semantic CSS vars so it reads in
 * light + dark across all 5 themes (no colour literals):
 * - `no`     → `--danger` (red)   — demolition NOT permitted
 * - `permit` → `--sun`    (amber) — permit required (semantic amber, every theme)
 * - `unknown`→ `--text-3` (muted) — unclassified
 */
const CLASS_COLOR: Record<HackClass, string> = {
  no: 'var(--danger)',
  permit: 'var(--sun)',
  unknown: 'var(--text-3)',
}

/** Legend row order — most → least restrictive. */
const LEGEND_ORDER: HackClass[] = ['no', 'permit', 'unknown']

interface HackabilityLayerProps {
  /** Walls of the CURRENT edited storey (pre-filtered by level by the caller). */
  walls: PlanWall[]
  toPx: (m: number) => number
}

/**
 * R4-7 — the **live hackability overlay** layer of the 2D plan SVG. Each wall of
 * the current storey is tinted by its demolition-permit class (`wallHackability`
 * over the user-declared `PlanWall.structure`): red = not permitted, amber =
 * permit required, muted = unclassified. Purely a visual highlight — it's
 * `pointer-events: none` so the underlying `WallsLayer` still owns selection/drag.
 * A small legend (three swatches + labels, RCP/MEP-style) sits above the plan.
 */
export function HackabilityLayer({ walls, toPx }: HackabilityLayerProps) {
  // Anchor the legend at the plan's top-left corner (min world x/z), lifted
  // above the walls into the grid margin so it never overlaps the drawing.
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  for (const w of walls) {
    minX = Math.min(minX, w.start[0], w.end[0])
    minZ = Math.min(minZ, w.start[1], w.end[1])
  }
  const hasWalls = Number.isFinite(minX) && Number.isFinite(minZ)

  const ROW_H = 16
  const legX = hasWalls ? toPx(minX) : 0
  const legY = hasWalls ? toPx(minZ) - ROW_H * LEGEND_ORDER.length - 18 : 0

  return (
    <g style={{ pointerEvents: 'none' }}>
      {walls.map((w) => {
        const cls = wallHackability(w.structure)
        const d = wallSvgPath(w, toPx)
        const bodyW = w.thickness === 'external' ? 7 : 4
        return (
          <path
            key={w.id}
            d={d}
            fill="none"
            stroke={CLASS_COLOR[cls]}
            strokeOpacity={0.5}
            strokeWidth={bodyW + 6}
            strokeLinecap="round"
          >
            <title>{`${hackClassLabel(cls)} — ${hackClassDescription(cls)}`}</title>
          </path>
        )
      })}
      {hasWalls && (
        <g transform={`translate(${legX} ${legY})`}>
          <rect
            x={-6}
            y={-6}
            width={148}
            height={ROW_H * LEGEND_ORDER.length + 8}
            rx={6}
            fill="var(--surface)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          {LEGEND_ORDER.map((cls, i) => {
            const y = i * ROW_H
            return (
              <g key={cls} transform={`translate(0 ${y})`}>
                <rect
                  x={0}
                  y={0}
                  width={12}
                  height={12}
                  rx={2}
                  fill={CLASS_COLOR[cls]}
                  fillOpacity={0.5}
                  stroke={CLASS_COLOR[cls]}
                  strokeWidth={1}
                />
                <text
                  x={18}
                  y={6}
                  dominantBaseline="central"
                  style={{ fontSize: 10, fontWeight: 600, fill: 'var(--text)' }}
                >
                  {hackClassLabel(cls)}
                </text>
              </g>
            )
          })}
        </g>
      )}
    </g>
  )
}
