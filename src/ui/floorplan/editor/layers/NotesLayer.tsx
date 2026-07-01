import type React from 'react'
import type { PlanNote } from '../../../../floorplan/types'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import type { Tool } from '../planConstants'

interface NotesLayerProps {
  /** Text notes for the active storey (pre-filtered by level). */
  notes: PlanNote[]
  sel: PlanSelection
  toPx: (m: number) => number
  tool: Tool
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingNote: (v: { id: string; gx: number; gz: number }) => void
}

/**
 * The active storey's **text notes** layer of the 2D plan SVG — each note as a
 * halo-outlined label; click (select tool) to select + drag, edit/delete in the
 * inspector. Extracted verbatim from `FloorPlanEditor` as behaviour-preserving
 * code-motion (MOD-FPE-SPLIT).
 */
export function NotesLayer({
  notes,
  sel,
  toPx,
  tool,
  beginElementDrag,
  pointerWorld,
  setMovingNote,
}: NotesLayerProps) {
  return (
    <>
      {notes.map((nt) => {
        const selected = sel?.type === 'note' && sel.id === nt.id
        return (
          <text
            key={nt.id}
            x={toPx(nt.x)}
            y={toPx(nt.z)}
            textAnchor="middle"
            dominantBaseline="middle"
            className="plan-note"
            style={{
              cursor: tool === 'select' ? 'move' : 'crosshair',
              fontSize: 12,
              fontWeight: 600,
              fill: selected ? 'var(--accent)' : 'var(--text)',
              paintOrder: 'stroke',
              stroke: 'var(--surface)',
              strokeWidth: 3,
              strokeLinejoin: 'round',
            }}
            onPointerDown={(e) => {
              if (tool !== 'select') return
              const willMove = beginElementDrag(e, sel?.type === 'note' && sel.id === nt.id)
              useStore.getState().setPlanSelection({ type: 'note', id: nt.id })
              if (!willMove) return
              const [wx, wz] = pointerWorld(e)
              setMovingNote({ id: nt.id, gx: wx - nt.x, gz: wz - nt.z })
            }}
          >
            {nt.text}
          </text>
        )
      })}
    </>
  )
}
