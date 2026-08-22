/**
 * An architectural dimension callout for one wall: extension lines off each end,
 * a dimension line spanning the length with arrowheads, and the length text
 * centred on it (rotated to run along the line, with a gap so the line doesn't
 * strike through the text). The callout is pushed to the side away from the plan
 * centre so it reads "outside" the wall rather than into the adjacent room.
 *
 * All geometry is in screen px (the editor SVG renders 1:1); callers pass world
 * metres for the endpoints + a `toPx` projector.
 */

const OFFSET = 14 // px: dimension line's distance from the wall
const EXT_PAST = 5 // px: how far extension lines run past the dimension line
const ARROW_LEN = 7
const ARROW_W = 5
const GAP_PAD = 3 // px padding around the text gap

interface Props {
  /** Wall endpoints in world metres. */
  a: [number, number]
  b: [number, number]
  label: string
  /** World-metres → screen-px projector (shared editor transform). */
  toPx: (m: number) => number
  /** Plan centre in screen px — callouts orient away from it. */
  centre: [number, number]
  fontPx: number
  selected: boolean
}

export function WallDimension({ a, b, label, toPx, centre, fontPx, selected }: Props) {
  const ax = toPx(a[0])
  const ay = toPx(a[1])
  const bx = toPx(b[0])
  const by = toPx(b[1])
  const dx = bx - ax
  const dy = by - ay
  const L = Math.hypot(dx, dy)
  if (L < 1) return null
  const ux = dx / L
  const uy = dy / L
  // Normal, flipped to point away from the plan centre.
  let nx = -uy
  let ny = ux
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  if ((mx - centre[0]) * nx + (my - centre[1]) * ny < 0) {
    nx = -nx
    ny = -ny
  }

  const a2x = ax + nx * OFFSET
  const a2y = ay + ny * OFFSET
  const b2x = bx + nx * OFFSET
  const b2y = by + ny * OFFSET
  const mcx = (a2x + b2x) / 2
  const mcy = (a2y + b2y) / 2

  const halfText = (label.length * fontPx * 0.55) / 2 + GAP_PAD
  const gapFits = L / 2 > halfText + ARROW_LEN

  // Arrowhead triangle at `tip`, pointing along `dir`·u (into the span).
  const arrow = (tx: number, ty: number, dir: number) =>
    `${tx},${ty} ` +
    `${tx + dir * ux * ARROW_LEN + (nx * ARROW_W) / 2},${ty + dir * uy * ARROW_LEN + (ny * ARROW_W) / 2} ` +
    `${tx + dir * ux * ARROW_LEN - (nx * ARROW_W) / 2},${ty + dir * uy * ARROW_LEN - (ny * ARROW_W) / 2}`

  let deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg > 90) deg -= 180
  else if (deg < -90) deg += 180

  // Text sits in the line gap when it fits, otherwise just outside the line.
  const tx = gapFits ? mcx : mcx + nx * (fontPx * 0.7 + 2)
  const ty = gapFits ? mcy : mcy + ny * (fontPx * 0.7 + 2)

  const lineColor = selected ? 'var(--accent)' : 'var(--text-3)'
  const textColor = selected ? 'var(--accent)' : 'var(--text-2)'

  return (
    <g style={{ pointerEvents: 'none' }} className="plan-dim">
      {/* Extension lines from the wall ends out past the dimension line. */}
      <line
        x1={ax + nx * 2}
        y1={ay + ny * 2}
        x2={a2x + nx * EXT_PAST}
        y2={a2y + ny * EXT_PAST}
        stroke={lineColor}
        strokeWidth={1}
      />
      <line
        x1={bx + nx * 2}
        y1={by + ny * 2}
        x2={b2x + nx * EXT_PAST}
        y2={b2y + ny * EXT_PAST}
        stroke={lineColor}
        strokeWidth={1}
      />
      {/* Dimension line — split around the text when there's room. */}
      {gapFits ? (
        <>
          <line
            x1={a2x}
            y1={a2y}
            x2={mcx - ux * halfText}
            y2={mcy - uy * halfText}
            stroke={lineColor}
            strokeWidth={1}
          />
          <line
            x1={mcx + ux * halfText}
            y1={mcy + uy * halfText}
            x2={b2x}
            y2={b2y}
            stroke={lineColor}
            strokeWidth={1}
          />
        </>
      ) : (
        <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke={lineColor} strokeWidth={1} />
      )}
      <polygon points={arrow(a2x, a2y, 1)} fill={lineColor} />
      <polygon points={arrow(b2x, b2y, -1)} fill={lineColor} />
      <text
        x={tx}
        y={ty}
        transform={`rotate(${deg} ${tx} ${ty})`}
        textAnchor="middle"
        dominantBaseline="middle"
        className="plan-dim-label select-none"
        fill={textColor}
        style={{ fontSize: fontPx }}
      >
        {label}
      </text>
    </g>
  )
}
