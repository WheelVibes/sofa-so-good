import type React from 'react'
import { doorPlanSymbol } from '../../../../floorplan/doorSwing'
import { type PlanOpening, type PlanWall, wallLength } from '../../../../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../../../../floorplan/wallArc'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import type { Tool } from '../planConstants'

interface OpeningsLayerProps {
  openings: PlanOpening[]
  walls: PlanWall[]
  sel: PlanSelection
  strayOpenings: Set<string>
  toPx: (m: number) => number
  PX: number
  skeleton: boolean
  tool: Tool
  editMode: 'view' | 'edit'
  setPlanSelection: (sel: PlanSelection) => void
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  alongWall: (wall: PlanWall, x: number, z: number) => number
  setMovingOpening: (v: { id: string; grab: number }) => void
}

/**
 * The active storey's **openings** layer of the 2D plan SVG — each door/window
 * as its architectural symbol (door leaf + swing arc, or window double-line),
 * arc-aware for curved walls, with a wall mask, selection halo, fat hit target
 * and along-wall drag. Extracted verbatim from `FloorPlanEditor` as
 * behaviour-preserving code-motion (MOD-FPE-SPLIT).
 */
export function OpeningsLayer({
  openings,
  walls,
  sel,
  strayOpenings,
  toPx,
  PX,
  skeleton,
  tool,
  editMode,
  setPlanSelection,
  beginElementDrag,
  pointerWorld,
  alongWall,
  setMovingOpening,
}: OpeningsLayerProps) {
  return (
    <>
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        if (!wall) return null
        const len = wallLength(wall)
        if (len === 0) return null
        // Jamb endpoints + wall normal — arc-aware for curved walls.
        let nx: number
        let nz: number
        let sPt: [number, number]
        let ePt: [number, number]
        if (isCurvedWall(wall)) {
          const a0 = pointAtArcLength(wall, o.offset)
          const a1 = pointAtArcLength(wall, o.offset + o.width)
          const m = pointAtArcLength(wall, o.offset + o.width / 2)
          nx = -Math.cos(m.angle)
          nz = Math.sin(m.angle)
          sPt = [a0.x, a0.z]
          ePt = [a1.x, a1.z]
        } else {
          const ux = (wall.end[0] - wall.start[0]) / len
          const uz = (wall.end[1] - wall.start[1]) / len
          nx = -uz
          nz = ux
          sPt = [wall.start[0] + ux * o.offset, wall.start[1] + uz * o.offset]
          ePt = [
            wall.start[0] + ux * (o.offset + o.width),
            wall.start[1] + uz * (o.offset + o.width),
          ]
        }
        const isSel = sel?.type === 'opening' && sel.id === o.id
        // Stray opening (sitting off its wall's span) → red so it's flagged.
        const color = isSel
          ? 'var(--accent)'
          : strayOpenings.has(o.id)
            ? 'var(--danger)'
            : o.kind === 'door'
              ? 'var(--accent)'
              : 'var(--accent-soft-text)'
        const strokeW = skeleton ? 2 : wall.thickness === 'external' ? 7 : 4
        const onPD = (e: React.PointerEvent) => {
          if (tool !== 'select') return
          const willMove = beginElementDrag(e, isSel)
          setPlanSelection({ type: 'opening', id: o.id })
          if (!willMove) return // view / unselected-on-touch: let it pan
          if (o.locked) return // locked openings select but don't move
          // Start dragging the opening along its wall.
          const [wx, wz] = pointerWorld(e)
          useStore.getState().pushHistory()
          setMovingOpening({ id: o.id, grab: alongWall(wall, wx, wz) - o.offset })
        }
        return (
          <g
            key={o.id}
            data-opening={o.id}
            onPointerDown={onPD}
            style={{ cursor: editMode === 'edit' && !o.locked ? 'grab' : 'pointer' }}
          >
            {/* Selected: translucent accent halo over the opening span so
              the selection is obvious (mirrors the furniture highlight). */}
            {isSel && (
              <line
                x1={toPx(sPt[0])}
                y1={toPx(sPt[1])}
                x2={toPx(ePt[0])}
                y2={toPx(ePt[1])}
                stroke="var(--accent)"
                strokeOpacity={0.4}
                strokeWidth={strokeW + 11}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Fat invisible hit target along the opening span so the whole
              door/window is easy to grab (drag it along the wall), not
              just its thin symbol lines. */}
            <line
              x1={toPx(sPt[0])}
              y1={toPx(sPt[1])}
              x2={toPx(ePt[0])}
              y2={toPx(ePt[1])}
              stroke="transparent"
              strokeWidth={Math.max(16, strokeW + 10)}
              strokeLinecap="round"
            />
            {/* Mask the wall under the opening */}
            <line
              x1={toPx(sPt[0])}
              y1={toPx(sPt[1])}
              x2={toPx(ePt[0])}
              y2={toPx(ePt[1])}
              stroke="var(--surface-solid)"
              strokeWidth={strokeW + 2}
              strokeLinecap="butt"
              style={{ pointerEvents: 'none' }}
            />
            {o.kind === 'door' ? (
              (() => {
                // Architectural door symbol from the shared builder: one/two
                // swing leaves (panel/flush/glazed/bifold vs double) each drawn
                // as a leaf line + quarter arc, honouring hinge/swing; or a
                // sliding door's leaf bar + slide-direction arrow (no arc).
                const sym = doorPlanSymbol(wall, o)
                if (!sym) return null
                if (sym.kind === 'sliding') {
                  const [b0, b1] = sym.bar
                  const [a0, a1] = sym.arrow
                  // Arrowhead: two short barbs at the arrow tip.
                  const adx = a1[0] - a0[0]
                  const adz = a1[1] - a0[1]
                  const alen = Math.hypot(adx, adz) || 1
                  const uax = adx / alen
                  const uaz = adz / alen
                  const hb = 0.09 // barb length (m)
                  return (
                    <>
                      <line
                        x1={toPx(b0[0])}
                        y1={toPx(b0[1])}
                        x2={toPx(b1[0])}
                        y2={toPx(b1[1])}
                        stroke={color}
                        strokeWidth={isSel ? 4 : 3}
                        strokeLinecap="round"
                      />
                      <line
                        x1={toPx(a0[0])}
                        y1={toPx(a0[1])}
                        x2={toPx(a1[0])}
                        y2={toPx(a1[1])}
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.8}
                      />
                      <line
                        x1={toPx(a1[0])}
                        y1={toPx(a1[1])}
                        x2={toPx(a1[0] - (uax + uaz) * hb)}
                        y2={toPx(a1[1] - (uaz - uax) * hb)}
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.8}
                      />
                      <line
                        x1={toPx(a1[0])}
                        y1={toPx(a1[1])}
                        x2={toPx(a1[0] - (uax - uaz) * hb)}
                        y2={toPx(a1[1] - (uaz + uax) * hb)}
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.8}
                      />
                    </>
                  )
                }
                return (
                  <>
                    {sym.leaves.map((lf, i) => (
                      <g key={`${o.id}.leaf${i}`}>
                        <line
                          x1={toPx(lf.hinge[0])}
                          y1={toPx(lf.hinge[1])}
                          x2={toPx(lf.leafTip[0])}
                          y2={toPx(lf.leafTip[1])}
                          stroke={color}
                          strokeWidth={isSel ? 3 : 2}
                        />
                        <path
                          d={`M ${toPx(lf.freeJamb[0])} ${toPx(lf.freeJamb[1])} A ${lf.radius * PX} ${lf.radius * PX} 0 0 ${lf.sweep} ${toPx(lf.leafTip[0])} ${toPx(lf.leafTip[1])}`}
                          fill="none"
                          stroke={color}
                          strokeWidth={1}
                          opacity={0.7}
                        />
                      </g>
                    ))}
                  </>
                )
              })()
            ) : (
              <>
                {/* Window double line across the opening */}
                {[-1, 1].map((s) => (
                  <line
                    key={s}
                    x1={toPx(sPt[0] + nx * 0.04 * s)}
                    y1={toPx(sPt[1] + nz * 0.04 * s)}
                    x2={toPx(ePt[0] + nx * 0.04 * s)}
                    y2={toPx(ePt[1] + nz * 0.04 * s)}
                    stroke={color}
                    strokeWidth={isSel ? 2.5 : 1.5}
                  />
                ))}
              </>
            )}
          </g>
        )
      })}
    </>
  )
}
