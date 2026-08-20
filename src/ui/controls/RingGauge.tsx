import type { ReactNode } from 'react'

interface RingGaugeProps {
  /** Fill fraction, 0..1 (clamped; values past 1 render a full ring). */
  value: number
  /** Outer diameter in px. */
  size?: number
  strokeWidth?: number
  /** Paint the sweep in the danger colour (over budget / limit breached). */
  danger?: boolean
  /** Accessible description of what the ring shows. */
  ariaLabel: string
  /** Centre content (a compact % readout, an icon…). */
  children?: ReactNode
}

/**
 * Radial progress ring (UIUX-37, the bklit ring / activity-gauge pattern,
 * dependency-free): an SVG track + sweep drawn with stroke-dasharray, starting
 * at 12 o'clock. The sweep animates on the motion tokens via CSS (`.ring-fg`
 * transitions stroke-dashoffset; the app's reduced-motion block zeroes it).
 * Token colours only — accent sweep, danger when `danger`, `--surface-2` track.
 */
export function RingGauge({
  value,
  size = 48,
  strokeWidth = 5,
  danger = false,
  ariaLabel,
  children,
}: RingGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={`ring-gauge${danger ? ' danger' : ''}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
      >
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={strokeWidth} />
        <circle
          className="ring-fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children ? <span className="ring-label">{children}</span> : null}
    </div>
  )
}
