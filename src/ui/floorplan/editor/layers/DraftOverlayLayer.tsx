import { formatArea, formatLength, type UnitSystem } from '../../../../utils/measurement'
import type { MarqueeRect } from '../marqueeSelect'
import type { Tool } from '../planConstants'

interface DraftOverlayLayerProps {
  /** Live draw draft (start + current end), or null when not drawing. */
  draft: { x0: number; z0: number; x: number; z: number } | null
  tool: Tool
  toPx: (m: number) => number
  PX: number
  /** Numeric-entry preview endpoint (overrides the live drag end) or null. */
  numericPreviewEnd: [number, number] | null
  marquee: MarqueeRect | null
  polyDraft: [number, number][]
  polylineDraft: [number, number][]
  fWallNumericEntry: boolean
  isMobile: boolean
  units: UnitSystem
}

/**
 * The 2D plan SVG's **in-progress drawing overlays** — the scale/dimension draft
 * line, the live wall draft (segment + snap markers), the room draft rect, the
 * rubber-band multi-select marquee, the polygon-room + polyline markup drafts,
 * and the cursor-following length/size readout. All pure previews (no state
 * writes). Extracted verbatim from `FloorPlanEditor` as behaviour-preserving
 * code-motion (MOD-FPE-SPLIT).
 */
export function DraftOverlayLayer({
  draft,
  tool,
  toPx,
  PX,
  numericPreviewEnd,
  marquee,
  polyDraft,
  polylineDraft,
  fWallNumericEntry,
  isMobile,
  units,
}: DraftOverlayLayerProps) {
  return (
    <>
      {/* Scale calibration / dimension draft line */}
      {draft && (tool === 'scale' || tool === 'dimension') && (
        <line
          x1={toPx(draft.x0)}
          y1={toPx(draft.z0)}
          x2={toPx(draft.x)}
          y2={toPx(draft.z)}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      )}

      {/* Draft (in-progress draw) */}
      {draft &&
        tool === 'wall' &&
        (() => {
          // When the user is typing in the numeric overlay, preview uses that
          // endpoint; otherwise the live drag position.
          const effX = numericPreviewEnd ? numericPreviewEnd[0] : draft.x
          const effZ = numericPreviewEnd ? numericPreviewEnd[1] : draft.z
          return (
            <>
              <line
                x1={toPx(draft.x0)}
                y1={toPx(draft.z0)}
                x2={toPx(effX)}
                y2={toPx(effZ)}
                stroke="var(--accent)"
                strokeWidth={4}
                strokeLinecap="round"
              />
              {/* Snap markers at the exact endpoints so the point you're placing
                is visible even under a fingertip. The filled dot is the
                start/anchor; the ring is the live end. */}
              <circle cx={toPx(draft.x0)} cy={toPx(draft.z0)} r={5} fill="var(--accent)" />
              <circle
                cx={toPx(effX)}
                cy={toPx(effZ)}
                r={5}
                fill="var(--surface-solid)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            </>
          )
        })()}
      {draft && tool === 'room' && (
        <rect
          x={toPx(Math.min(draft.x0, draft.x))}
          y={toPx(Math.min(draft.z0, draft.z))}
          width={Math.abs(draft.x - draft.x0) * PX}
          height={Math.abs(draft.z - draft.z0) * PX}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
        />
      )}
      {/* Rubber-band marquee (PARITY-PLAN-MARQUEE): a dashed accent box while
        dragging on empty canvas; on release everything it crosses is
        multi-selected. Pointer-transparent so it can't intercept the drag. */}
      {marquee && (
        <rect
          x={toPx(Math.min(marquee.x0, marquee.x1))}
          y={toPx(Math.min(marquee.z0, marquee.z1))}
          width={Math.abs(marquee.x1 - marquee.x0) * PX}
          height={Math.abs(marquee.z1 - marquee.z0) * PX}
          fill="var(--accent-soft)"
          fillOpacity={0.25}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeDasharray="4 3"
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* In-progress polygon room: placed edges + vertices; the first vertex is
        ringed (click it, or press Enter, to close). */}
      {tool === 'polyroom' && polyDraft.length > 0 && (
        <g>
          <polyline
            points={polyDraft.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          {polyDraft.map(([x, z], i) => (
            <circle
              key={i}
              cx={toPx(x)}
              cy={toPx(z)}
              r={i === 0 ? 6 : 4}
              fill={i === 0 ? 'none' : 'var(--accent)'}
              stroke="var(--accent)"
              strokeWidth={i === 0 ? 2 : 0}
            />
          ))}
        </g>
      )}
      {/* In-progress polyline markup: placed edges + vertices; the first vertex
        is ringed (click it to close, or press Enter to finish as an open path). */}
      {tool === 'polyline' && polylineDraft.length > 0 && (
        <g>
          <polyline
            points={polylineDraft.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {polylineDraft.map(([x, z], i) => (
            <circle
              key={i}
              cx={toPx(x)}
              cy={toPx(z)}
              r={i === 0 ? 6 : 4}
              fill={i === 0 ? 'none' : 'var(--accent)'}
              stroke="var(--accent)"
              strokeWidth={i === 0 ? 2 : 0}
            />
          ))}
        </g>
      )}
      {/* Live dimension readout while drawing — follows the cursor with a
        readable halo. When numeric-entry is active, the overlay shows the
        numbers; this SVG readout is suppressed to avoid duplication. */}
      {draft && !(tool === 'wall' && fWallNumericEntry && !isMobile) && (
        <text
          x={toPx(draft.x) + 10}
          y={toPx(draft.z) - 10}
          fontSize={13}
          fontWeight={700}
          fill="var(--accent)"
          className="select-none"
          style={{ paintOrder: 'stroke', stroke: 'var(--surface-solid)', strokeWidth: 4 }}
        >
          {tool === 'wall'
            ? (() => {
                const len = Math.hypot(draft.x - draft.x0, draft.z - draft.z0)
                // Angle CCW from east, with +Z (screen-down) shown as a downward
                // bearing — negate dz so 0° is east, 90° is north.
                const raw = Math.round(
                  (Math.atan2(-(draft.z - draft.z0), draft.x - draft.x0) * 180) / Math.PI,
                )
                const deg = ((raw % 360) + 360) % 360
                return `${formatLength(len, units)}  ${deg}°`
              })()
            : `${formatLength(Math.abs(draft.x - draft.x0), units)} × ${formatLength(Math.abs(draft.z - draft.z0), units)}  (${formatArea(Math.abs(draft.x - draft.x0) * Math.abs(draft.z - draft.z0), units)})`}
        </text>
      )}
    </>
  )
}
