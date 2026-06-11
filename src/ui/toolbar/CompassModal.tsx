import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalGuard } from '../../controls/modalGuard'
import { useStore } from '../../state/store'

const COMPASS_DIRS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
] as const

/** Drag-to-set apartment sun orientation. Moved verbatim from the old Toolbar. */
export function CompassModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const orientationDeg = useStore((s) => s.orientationDeg)
  const setOrientationDeg = useStore((s) => s.setOrientationDeg)
  const ref = useRef<SVGSVGElement>(null)
  const draggingRef = useRef(false)

  // Modal-style overlay: suppress global shortcuts while open.
  useModalGuard(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const updateFromPointer = (e: { clientX: number; clientY: number }) => {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    setOrientationDeg(deg)
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    updateFromPointer(e)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return
    updateFromPointer(e)
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const size = 260
  const r = size / 2 - 8
  const center = size / 2
  const sunR = r - 32
  const rad = (orientationDeg * Math.PI) / 180
  const sunX = center + Math.sin(rad) * sunR
  const sunY = center - Math.cos(rad) * sunR
  const rounded = Math.round(orientationDeg) % 360

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="max-h-[90vh] overflow-auto rounded-lg bg-[var(--surface-solid)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between gap-6">
          <h2 className="text-base font-semibold text-[var(--text)]">Sun direction</h2>
          <span className="tabular-nums text-sm text-[var(--text-3)]">
            {Math.round(orientationDeg)}°
          </span>
        </div>
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="cursor-pointer touch-none select-none"
        >
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="var(--surface-2)"
            stroke="var(--border-2)"
            strokeWidth={1}
          />
          <circle
            cx={center}
            cy={center}
            r={r - 18}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i * 15 * Math.PI) / 180
            const major = i % 6 === 0
            const inner = r - (major ? 8 : 4)
            const x1 = center + Math.sin(a) * inner
            const y1 = center - Math.cos(a) * inner
            const x2 = center + Math.sin(a) * r
            const y2 = center - Math.cos(a) * r
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? 'var(--text-3)' : 'var(--border-2)'}
                strokeWidth={major ? 1 : 0.75}
              />
            )
          })}
          <line
            x1={center}
            y1={center}
            x2={sunX}
            y2={sunY}
            stroke="var(--text-2)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={center} cy={center} r={3} fill="var(--text-2)" />
          <circle
            cx={sunX}
            cy={sunY}
            r={9}
            fill="var(--sun)"
            stroke="var(--sun-edge)"
            strokeWidth={1.25}
          />
          {COMPASS_DIRS.map(({ label, deg }) => {
            const a = (deg * Math.PI) / 180
            const lr = r - 18
            const lx = center + Math.sin(a) * lr
            const ly = center - Math.cos(a) * lr
            const isCardinal = label.length === 1
            const active = rounded === deg
            return (
              <g
                key={label}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  draggingRef.current = false
                  setOrientationDeg(deg)
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={lx}
                  cy={ly}
                  r={isCardinal ? 14 : 12}
                  fill={active ? 'var(--accent-soft)' : 'transparent'}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={isCardinal ? 16 : 12}
                  fill={label === 'N' ? 'var(--danger)' : active ? 'var(--text)' : 'var(--text-2)'}
                  fontWeight={isCardinal ? 700 : 600}
                >
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
        <p className="mt-3 max-w-[260px] text-xs leading-snug text-[var(--text-3)]">
          Drag the sun or click a compass direction to set where the sun rises relative to the
          apartment.
        </p>
      </div>
    </div>,
    document.body,
  )
}
