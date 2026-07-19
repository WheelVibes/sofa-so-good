import type React from 'react'
import { ELEC_SYM_TEXT } from '../../../../floorplan/electricalPlanSvg'
import { PLUMB_SYM_TEXT } from '../../../../floorplan/plumbingPlanSvg'
import type { PlanElectricalPoint, PlanPlumbingPoint } from '../../../../floorplan/types'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import type { Tool } from '../planConstants'
// NOTE: the per-room socket-shortfall advisory (R4-4) is rendered by
// `RoomsLayer` (folded into the room label block, UXW-P2-1), not here.

/** A point being dragged: which family/id, plus the pointer-to-point offset
 *  (grabbed anywhere on the symbol, not just its centre) — same shape as
 *  `NotesLayer`'s `movingNote`. */
export interface MovingMepPoint {
  family: 'electrical' | 'plumbing'
  id: string
  gx: number
  gz: number
}

interface MepLayerProps {
  /** Electrical points for the active storey (pre-filtered by level). */
  electrical: PlanElectricalPoint[]
  /** Plumbing points for the active storey (pre-filtered by level). */
  plumbing: PlanPlumbingPoint[]
  sel: PlanSelection
  toPx: (m: number) => number
  tool: Tool
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingMep: (v: MovingMepPoint | null) => void
}

const R = 9 // symbol circle radius, px — matches the exported sheet's SYM_R.

/**
 * The active storey's **MEP points** layer of the 2D plan SVG (MEP layer, G1
 * PR3) — a `NotesLayer` clone: each electrical/plumbing point as a
 * circle+glyph symbol (the SAME `SYM_TEXT` glyph vocabulary the exported
 * electrical/plumbing sheets use — one symbol set, not two), electrical in
 * `--accent`, plumbing in the distinct `--accent-2` token, selected always
 * `--accent` (per `src/ui/CLAUDE.md`'s selection-colour convention). Click
 * (select tool) selects + drags via `beginElementDrag`; the inspector edits
 * kind/mount-height/label and deletes.
 */
export function MepLayer({
  electrical,
  plumbing,
  sel,
  toPx,
  tool,
  beginElementDrag,
  pointerWorld,
  setMovingMep,
}: MepLayerProps) {
  const point = (
    family: 'electrical' | 'plumbing',
    p: PlanElectricalPoint | PlanPlumbingPoint,
    symText: string,
  ) => {
    const selected = sel?.type === 'mep' && sel.family === family && sel.id === p.id
    const cx = toPx(p.x)
    const cz = toPx(p.z)
    const color = selected
      ? 'var(--accent)'
      : family === 'electrical'
        ? 'var(--accent)'
        : 'var(--accent-2)'
    return (
      <g
        key={`${family}-${p.id}`}
        style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
        onPointerDown={(e) => {
          if (tool !== 'select') return
          const willMove = beginElementDrag(e, selected)
          useStore.getState().setPlanSelection({ type: 'mep', family, id: p.id })
          if (!willMove) return
          const [wx, wz] = pointerWorld(e)
          setMovingMep({ family, id: p.id, gx: wx - p.x, gz: wz - p.z })
        }}
      >
        <circle
          cx={cx}
          cy={cz}
          r={R}
          fill="var(--surface)"
          stroke={color}
          strokeWidth={selected ? 2 : 1.5}
        />
        <text
          x={cx}
          y={cz}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ pointerEvents: 'none', fontSize: 8, fontWeight: 700, fill: color }}
        >
          {symText}
        </text>
        {p.label && (
          <text
            x={cx + R + 3}
            y={cz}
            dominantBaseline="central"
            style={{
              pointerEvents: 'none',
              fontSize: 10,
              fontWeight: 600,
              fill: selected ? 'var(--accent)' : 'var(--text)',
              paintOrder: 'stroke',
              stroke: 'var(--surface)',
              strokeWidth: 3,
              strokeLinejoin: 'round',
            }}
          >
            {p.label}
          </text>
        )}
      </g>
    )
  }

  return (
    <>
      {electrical.map((p) => point('electrical', p, ELEC_SYM_TEXT[p.kind]))}
      {plumbing.map((p) => point('plumbing', p, PLUMB_SYM_TEXT[p.kind]))}
    </>
  )
}
