import { useEffect, useRef, useState } from 'react'
import {
  isSmoothPoint,
  type ProfilePoint,
  smoothProfile,
} from '../../furniture/glbEdit/shapeProfiles'
import { Select } from '../controls/Select'
import { Icon } from '../toolbar/icons'

/** The 2D coordinate window a profile lives in (see `shapeProfiles.ts`): lathe
 *  is x ∈ [0,1] (radius) / y ∈ [0,1] (height); extrude is [-0.5, 0.5] centred. */
export interface ProfileSpace {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Draw the revolve axis (lathe) at x = 0. */
  showAxis?: boolean
  /** The outline is a CLOSED loop (extrude / loft cross-section) — the drawn
   *  curve preview wraps its tangents + closes the path. Absent → an OPEN profile
   *  (lathe, sweep path) whose endpoints stay corners. Mirrors the `closed`
   *  argument `buildObject` passes to `smoothProfile`, so the preview matches the
   *  built geometry. */
  closed?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * A compact draggable 2D point editor for `lathe` profiles + `extrude` outlines,
 * shared by the `PartInspector`. Renders an SVG with the profile polyline and
 * draggable points (44px touch targets, so it works on mobile), a preset
 * dropdown that seeds the whole point list, add/remove, and numeric X/Y entry
 * for the selected point. Pure presentational — edits flow up through
 * `onChange`; all geometry maths live in `shapeProfiles.ts`.
 */
export function ProfileEditor({
  points,
  space,
  presets,
  presetLabels,
  onChange,
}: {
  points: ProfilePoint[]
  space: ProfileSpace
  presets: Record<string, ProfilePoint[]>
  presetLabels: Record<string, string>
  onChange: (pts: ProfilePoint[]) => void
}) {
  const W = 220
  const H = 180
  const PAD = 18
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragIdx = useRef<number | null>(null)
  const [sel, setSel] = useState(0)
  // rAF-coalesced drag: a pointermove only stashes the latest data point; a
  // single rAF flushes it as ONE `onChange` per animation frame (a fast drag can
  // fire pointermove many times per frame — each `onChange` re-renders the whole
  // dialog + rebuilds the parametric geometry, so uncoalesced they thrash).
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<ProfilePoint | null>(null)
  // Cancel a pending flush on unmount.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const { minX, maxX, minY, maxY } = space
  const toPx = (p: ProfilePoint): [number, number] => [
    PAD + ((p[0] - minX) / (maxX - minX)) * (W - 2 * PAD),
    H - PAD - ((p[1] - minY) / (maxY - minY)) * (H - 2 * PAD),
  ]
  const toData = (px: number, py: number): ProfilePoint => [
    clamp(round3(minX + ((px - PAD) / (W - 2 * PAD)) * (maxX - minX)), minX, maxX),
    clamp(round3(minY + ((H - PAD - py) / (H - 2 * PAD)) * (maxY - minY)), minY, maxY),
  ]

  const eventToData = (e: { clientX: number; clientY: number }): ProfilePoint | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    return toData(px, py)
  }

  // Re-place a point's X or Y while KEEPING its smooth flag (the optional third
  // tuple element) — a numeric edit must not silently sharpen a smooth point.
  const withXY = (p: ProfilePoint, axis: 0 | 1, value: number): ProfilePoint => {
    const next: ProfilePoint = [axis === 0 ? value : p[0], axis === 1 ? value : p[1]]
    if (isSmoothPoint(p)) next[2] = 1
    return next
  }

  const moveSelected = (axis: 0 | 1, value: number) => {
    onChange(points.map((p, i) => (i === sel ? withXY(p, axis, value) : p)))
  }

  // Flip the selected point between smooth (Catmull-Rom) and sharp (corner).
  const toggleSmooth = () => {
    onChange(
      points.map((p, i) => (i === sel ? (isSmoothPoint(p) ? [p[0], p[1]] : [p[0], p[1], 1]) : p)),
    )
  }

  const addPoint = () => {
    // Insert a midpoint after the selected point (or at the end).
    const i = clamp(sel, 0, points.length - 1)
    const a = points[i]
    const b = points[Math.min(i + 1, points.length - 1)]
    const mid: ProfilePoint = [round3((a[0] + b[0]) / 2), round3((a[1] + b[1]) / 2)]
    const next = [...points.slice(0, i + 1), mid, ...points.slice(i + 1)]
    onChange(next)
    setSel(i + 1)
  }

  const removePoint = () => {
    if (points.length <= 2) return
    onChange(points.filter((_, i) => i !== sel))
    setSel((s) => Math.max(0, s - 1))
  }

  // The drawn preview path is the SMOOTHED polyline (Catmull-Rom through smooth
  // points) so the editor shows the real curve the geometry will build, not the
  // raw control polygon. An all-sharp profile smooths to itself → identical to
  // the old straight polyline. A closed outline closes the loop.
  const smoothed = smoothProfile(points, { closed: space.closed })
  const previewPts = space.closed && smoothed.length > 0 ? [...smoothed, smoothed[0]] : smoothed
  const poly = previewPts.map((p) => toPx(p).join(',')).join(' ')
  const selPt = points[clamp(sel, 0, points.length - 1)]
  const selSmooth = selPt ? isSmoothPoint(selPt) : false
  const [axisX] = toPx([0, minY])

  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      <Select
        className="input"
        ariaLabel="Profile preset"
        value=""
        placeholder="Preset…"
        onChange={(id) => {
          if (presets[id]) {
            onChange(presets[id].map((p) => [...p] as ProfilePoint))
            setSel(0)
          }
        }}
        options={[
          { value: '', label: 'Preset…' },
          ...Object.keys(presets).map((id) => ({ value: id, label: presetLabels[id] ?? id })),
        ]}
        style={{ width: '100%' }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Profile point editor"
        style={{
          width: '100%',
          marginTop: 'var(--s-2)',
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-2)',
          border: '1px solid var(--border)',
          touchAction: 'none',
        }}
        onPointerMove={(e) => {
          if (dragIdx.current === null) return
          const d = eventToData(e)
          if (!d) return
          pendingRef.current = d
          // Coalesce: schedule at most one flush per frame. The rAF closure
          // captures THIS render's `points`/`onChange` — safe because `onChange`
          // fires (and re-renders) at most once per frame, so `points` is stable
          // within the frame.
          if (rafRef.current !== null) return
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            const pt = pendingRef.current
            pendingRef.current = null
            if (pt === null || dragIdx.current === null) return
            const idx = dragIdx.current
            // Keep the dragged point's smooth flag (drag only moves X/Y).
            const next: ProfilePoint = isSmoothPoint(points[idx]) ? [pt[0], pt[1], 1] : pt
            onChange(points.map((p, i) => (i === idx ? next : p)))
          })
        }}
        onPointerUp={(e) => {
          if (dragIdx.current !== null) {
            // Flush any point still pending from the last frame so pointerup
            // never drops the final position.
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current)
              rafRef.current = null
            }
            const pt = pendingRef.current
            pendingRef.current = null
            if (pt !== null) {
              const idx = dragIdx.current
              const next: ProfilePoint = isSmoothPoint(points[idx]) ? [pt[0], pt[1], 1] : pt
              onChange(points.map((p, i) => (i === idx ? next : p)))
            }
            ;(e.target as Element).releasePointerCapture?.(e.pointerId)
            dragIdx.current = null
          }
        }}
      >
        <title>Profile point editor</title>
        {space.showAxis ? (
          <line
            x1={axisX}
            y1={PAD}
            x2={axisX}
            y2={H - PAD}
            stroke="var(--border-2)"
            strokeDasharray="3 3"
          />
        ) : null}
        <polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {points.map((p, i) => {
          const [cx, cy] = toPx(p)
          const active = i === sel
          const fill = active ? 'var(--accent)' : 'var(--surface-3)'
          // Smooth points render as CIRCLES, sharp points as SQUARES — a glanceable
          // read of which points the curve rounds through vs. which are corners.
          const r = active ? 6 : 4.5
          return (
            <g key={i}>
              {/* 44px transparent touch target. */}
              <circle
                cx={cx}
                cy={cy}
                r={22}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.preventDefault()
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                  dragIdx.current = i
                  setSel(i)
                }}
                onDoubleClick={(e) => {
                  // Double-tap flips smooth/sharp (touch-friendly, no extra control).
                  e.preventDefault()
                  setSel(i)
                  onChange(
                    points.map((q, j) =>
                      j === i ? (isSmoothPoint(q) ? [q[0], q[1]] : [q[0], q[1], 1]) : q,
                    ),
                  )
                }}
              />
              {isSmoothPoint(p) ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              ) : (
                <rect
                  x={cx - r}
                  y={cy - r}
                  width={r * 2}
                  height={r * 2}
                  fill={fill}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })}
      </svg>
      {/* Numeric entry for the selected point + add/remove. */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--s-1)',
          alignItems: 'center',
          marginTop: 'var(--s-2)',
        }}
      >
        <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
          Pt {sel + 1}/{points.length}
        </span>
        {([0, 1] as const).map((axis) => (
          <input
            key={axis}
            type="number"
            className="input"
            step={0.05}
            value={selPt?.[axis] ?? 0}
            aria-label={`Profile point ${axis === 0 ? 'X' : 'Y'}`}
            onChange={(e) =>
              moveSelected(
                axis,
                clamp(
                  round3(Number(e.target.value)),
                  axis === 0 ? minX : minY,
                  axis === 0 ? maxX : maxY,
                ),
              )
            }
            style={{ width: 64 }}
          />
        ))}
        <button
          type="button"
          className={selSmooth ? 'icon-btn is-active' : 'icon-btn'}
          aria-label={selSmooth ? 'Make point sharp' : 'Make point smooth'}
          aria-pressed={selSmooth}
          title={selSmooth ? 'Smooth point — tap for sharp corner' : 'Sharp corner — tap to smooth'}
          onClick={toggleSmooth}
        >
          {/* Glyph reflects state: a curve when smooth, an angled corner when sharp. */}
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d={selSmooth ? 'M1 12 Q7 1 13 12' : 'M1 12 L7 3 L13 12'}
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add profile point"
          title="Add point"
          onClick={addPoint}
        >
          <Icon.Plus width={13} height={13} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Remove profile point"
          title="Remove point"
          disabled={points.length <= 2}
          onClick={removePoint}
        >
          <Icon.Close width={13} height={13} />
        </button>
      </div>
    </div>
  )
}
