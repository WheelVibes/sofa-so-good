import type React from 'react'
import { memo } from 'react'

/** Grid lines spanning the whole (margin-padded) canvas, so the plan sits on an
 *  open grid you can draw/pan across — not a tight box around the current
 *  bounds. Memoised: its inputs are stable during a wall drag, so the ~200
 *  lines don't re-render every pointer-move. */
export const GridLines = memo(function GridLines({
  W,
  H,
  PX,
  gridSize,
  margin,
  ew,
  ed,
}: {
  W: number
  H: number
  PX: number
  gridSize: number
  margin: number
  ew: number
  ed: number
}) {
  const g = gridSize > 0 ? gridSize : 0.5
  const lines: React.ReactNode[] = []
  const x0 = Math.ceil(-margin / g) * g
  const z0 = Math.ceil(-margin / g) * g
  for (let x = x0; x <= ew + margin + 1e-6; x += g) {
    const major = Math.abs(x - Math.round(x)) < 1e-6
    const px = (x + margin) * PX
    lines.push(
      <line
        key={`vx${x.toFixed(3)}`}
        x1={px}
        y1={0}
        x2={px}
        y2={H}
        stroke={major ? 'var(--border-2)' : 'var(--border)'}
        strokeWidth={major ? 1 : 0.5}
      />,
    )
  }
  for (let z = z0; z <= ed + margin + 1e-6; z += g) {
    const major = Math.abs(z - Math.round(z)) < 1e-6
    const py = (z + margin) * PX
    lines.push(
      <line
        key={`hz${z.toFixed(3)}`}
        x1={0}
        y1={py}
        x2={W}
        y2={py}
        stroke={major ? 'var(--border-2)' : 'var(--border)'}
        strokeWidth={major ? 1 : 0.5}
      />,
    )
  }
  return <g>{lines}</g>
})
