import type React from 'react'
import type { PlanWall } from '../../../../floorplan/types'
import { wallCurveMidpoint, wallSvgPath } from '../../../../floorplan/wallArc'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import type { Tool } from '../planConstants'

/** Live baseline for a whole-wall drag (start/end + grab point). */
export interface WallDragState {
  id: string
  s0: [number, number]
  e0: [number, number]
  grab: [number, number]
}

interface WallsLayerProps {
  walls: PlanWall[]
  sel: PlanSelection
  selectedWalls: Set<string>
  strayWalls: Set<string>
  toPx: (m: number) => number
  skeleton: boolean
  planWallMultiAdd: boolean
  fCurvedWalls: boolean
  tool: Tool
  editMode: 'view' | 'edit'
  svgRef: React.RefObject<SVGSVGElement | null>
  setPlanSelection: (sel: PlanSelection) => void
  toggleWallSelection: (id: string) => void
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingWall: (v: WallDragState) => void
  setMovingBulge: (v: { id: string }) => void
}

/**
 * The active storey's **walls** layer of the 2D plan SVG — each wall drawn with
 * its selection/stray halos, a fat invisible hit target, and (for a selected
 * curved wall) a midpoint bulge handle. Extracted verbatim from `FloorPlanEditor`
 * as behaviour-preserving code-motion (MOD-FPE-SPLIT); all editor state + the
 * drag/selection handlers arrive as props.
 */
export function WallsLayer({
  walls,
  sel,
  selectedWalls,
  strayWalls,
  toPx,
  skeleton,
  planWallMultiAdd,
  fCurvedWalls,
  tool,
  editMode,
  svgRef,
  setPlanSelection,
  toggleWallSelection,
  beginElementDrag,
  pointerWorld,
  setMovingWall,
  setMovingBulge,
}: WallsLayerProps) {
  return (
    <>
      {walls.map((w) => {
        const isSel = sel?.type === 'wall' && sel.id === w.id
        const inSel = selectedWalls.has(w.id) // primary OR a multi-select extra
        const stray = strayWalls.has(w.id) // joined to no other wall
        const d = wallSvgPath(w, toPx)
        const stroke = inSel
          ? 'var(--accent)'
          : stray
            ? 'var(--danger)'
            : w.thickness === 'external'
              ? 'var(--plan-wall)'
              : 'var(--text-3)'
        // Skeleton view draws every wall at one thin stroke so corner
        // connections (gaps / overlaps) are obvious regardless of thickness.
        const bodyW = skeleton ? 2 : w.thickness === 'external' ? 7 : 4
        const onWallDown = (e: React.PointerEvent) => {
          if (tool !== 'select') return
          // Additive select (Shift/⌘/Ctrl-click, or the touch "Select more"
          // toggle): toggle this wall in the multi-selection and don't drag.
          if (e.shiftKey || e.metaKey || e.ctrlKey || planWallMultiAdd) {
            e.stopPropagation()
            toggleWallSelection(w.id)
            return
          }
          const willMove = beginElementDrag(e, inSel)
          setPlanSelection({ type: 'wall', id: w.id })
          if (!willMove) return // view / unselected-on-touch: let it pan
          if (w.locked) return // locked walls select but don't move (like furniture)
          // Drag the whole wall (endpoint handles, which stopPropagation,
          // handle per-corner reshape instead).
          const [wx, wz] = pointerWorld(e)
          setMovingWall({ id: w.id, s0: [...w.start], e0: [...w.end], grab: [wx, wz] })
        }
        // Curve bulge handle: drag a selected wall's midpoint to bow it.
        const bulge =
          editMode === 'edit' && fCurvedWalls && isSel && tool === 'select' && !w.locked
            ? wallCurveMidpoint(w)
            : null
        return (
          <g key={w.id} data-wall={w.id}>
            {/* Selected: a translucent accent halo around the wall so the
              selection is obvious (mirrors the furniture highlight).
              Shown for every wall in the (multi-)selection. */}
            {inSel && (
              <path
                d={d}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={0.35}
                strokeWidth={bodyW + 11}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Stray wall halo (red dashed) so a disconnected wall stands
              out even when it's not selected. */}
            {stray && !inSel && (
              <path
                d={d}
                fill="none"
                stroke="var(--danger)"
                strokeOpacity={0.4}
                strokeWidth={bodyW + 8}
                strokeDasharray="2 5"
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Fat invisible hit target so curved/thin walls are easy to grab. */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              onPointerDown={onWallDown}
              style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={bodyW}
              strokeLinecap="round"
              onPointerDown={onWallDown}
              style={{ cursor: tool === 'select' ? 'pointer' : 'crosshair' }}
            />
            {bulge ? (
              <circle
                data-wall-bulge={w.id}
                cx={toPx(bulge[0])}
                cy={toPx(bulge[1])}
                r={5}
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth={1.5}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setPlanSelection({ type: 'wall', id: w.id })
                  setMovingBulge({ id: w.id })
                  svgRef.current?.setPointerCapture(e.pointerId)
                }}
              />
            ) : null}
          </g>
        )
      })}
    </>
  )
}
