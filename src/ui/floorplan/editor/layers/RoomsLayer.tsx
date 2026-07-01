import type React from 'react'
import { roomLabelPosition } from '../../../../floorplan/roomCentroid'
import { type PlanRoom, planRoomArea, planRoomPerimeter } from '../../../../floorplan/types'
import type { PlanSelection } from '../../../../state/slices/floorPlanSlice'
import { useStore } from '../../../../state/store'
import type { UnitSystem } from '../../../../utils/measurement'
import { formatArea, formatLength } from '../../../../utils/measurement'
import type { Tool } from '../planConstants'
import { roomLabelDetail, wrapLabel } from '../planLabelDisplay'
import { rectFromVerts } from '../toolDraftReducer'

interface RoomsLayerProps {
  rooms: PlanRoom[]
  sel: PlanSelection
  strayRooms: Set<string>
  toPx: (m: number) => number
  PX: number
  tool: Tool
  editMode: 'view' | 'edit'
  showRoomLabels: boolean
  roomFont: number
  units: UnitSystem
  svgRef: React.RefObject<SVGSVGElement | null>
  setPlanSelection: (sel: PlanSelection) => void
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMoving: (v: { id: string; gx: number; gz: number }) => void
  setMovingPolyVertex: (v: { id: string; index: number }) => void
  setMovingRoomLabel: (v: { id: string; gx: number; gz: number }) => void
}

/**
 * The active storey's **rooms** layer of the 2D plan SVG — each room's fill
 * (rect / L-extension / free polygon), the polygon-vertex reshape + edge-insert
 * handles (selected free-form rooms), and the progressive-detail name/area
 * label (with move-drag + optional rotation/font scale). Extracted verbatim from
 * `FloorPlanEditor` as behaviour-preserving code-motion (MOD-FPE-SPLIT).
 */
export function RoomsLayer({
  rooms,
  sel,
  strayRooms,
  toPx,
  PX,
  tool,
  editMode,
  showRoomLabels,
  roomFont,
  units,
  svgRef,
  setPlanSelection,
  beginElementDrag,
  pointerWorld,
  setMoving,
  setMovingPolyVertex,
  setMovingRoomLabel,
}: RoomsLayerProps) {
  return (
    <>
      {rooms.map((r) => {
        const isSel = sel?.type === 'room' && sel.id === r.id
        // Stray room (touches no other room) → red tint so it's obvious it
        // needs joining into the apartment.
        const stray = strayRooms.has(r.id)
        const roomFill = isSel
          ? 'var(--accent-soft)'
          : stray
            ? 'var(--danger-soft)'
            : 'var(--surface-2)'
        const roomStroke = isSel ? 'var(--accent)' : stray ? 'var(--danger)' : 'var(--border-2)'
        return (
          <g
            key={r.id}
            style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
            onPointerDown={(e) => {
              if (tool !== 'select') return
              const willMove = beginElementDrag(e, sel?.type === 'room' && sel.id === r.id)
              setPlanSelection({ type: 'room', id: r.id })
              if (!willMove) return
              const [wx, wz] = pointerWorld(e)
              setMoving({ id: r.id, gx: wx - r.origin[0], gz: wz - r.origin[1] })
            }}
          >
            {r.polygon && r.polygon.length >= 3 ? (
              <polygon
                points={r.polygon.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')}
                fill={roomFill}
                stroke={roomStroke}
                strokeDasharray="4 3"
              />
            ) : (
              <>
                <rect
                  x={toPx(r.origin[0])}
                  y={toPx(r.origin[1])}
                  width={r.width * PX}
                  height={r.depth * PX}
                  fill={roomFill}
                  stroke={roomStroke}
                  strokeDasharray="4 3"
                />
                {r.extension && (
                  <rect
                    x={toPx(r.origin[0] + r.extension.offset[0])}
                    y={toPx(r.origin[1] + r.extension.offset[1])}
                    width={r.extension.width * PX}
                    height={r.extension.depth * PX}
                    fill={roomFill}
                    stroke={roomStroke}
                    strokeDasharray="4 3"
                  />
                )}
              </>
            )}
            {/* Reshape handles: drag any vertex of a selected free-form
              (polyroom) room. stopPropagation keeps the room-move
              handler on the parent <g> from firing. */}
            {editMode === 'edit' && isSel && tool === 'select' && r.polygon && r.polygon.length >= 3
              ? [
                  // Edge-midpoint "+" handles: click to insert a vertex on
                  // that edge and immediately drag it (so a rectangle can
                  // grow an L / bay). Rendered first so vertex handles sit
                  // on top where they coincide.
                  ...(r.polygon as [number, number][]).map(([vx, vz], i) => {
                    const poly = r.polygon as [number, number][]
                    const [nx, nz] = poly[(i + 1) % poly.length]
                    const mx = (vx + nx) / 2
                    const mz = (vz + nz) / 2
                    return (
                      <circle
                        key={`pm-${r.id}-${i}`}
                        data-poly-midpoint={`${r.id}:${i}`}
                        cx={toPx(mx)}
                        cy={toPx(mz)}
                        r={3.5}
                        fill="var(--surface)"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        style={{ cursor: 'copy' }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          const next = [...poly]
                          next.splice(i + 1, 0, [mx, mz])
                          const { origin, width, depth } = rectFromVerts(next)
                          setPlanSelection({ type: 'room', id: r.id })
                          useStore
                            .getState()
                            .updateRoom(r.id, { polygon: next, origin, width, depth })
                          setMovingPolyVertex({ id: r.id, index: i + 1 })
                          svgRef.current?.setPointerCapture(e.pointerId)
                        }}
                      />
                    )
                  }),
                  // Vertex handles: drag to move, double-click to remove
                  // (kept ≥ 3 so the room stays a polygon).
                  ...(r.polygon as [number, number][]).map(([vx, vz], i) => (
                    <circle
                      key={`pv-${r.id}-${i}`}
                      data-poly-vertex={`${r.id}:${i}`}
                      cx={toPx(vx)}
                      cy={toPx(vz)}
                      r={5}
                      fill="var(--accent)"
                      stroke="var(--surface)"
                      strokeWidth={1.5}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        setPlanSelection({ type: 'room', id: r.id })
                        setMovingPolyVertex({ id: r.id, index: i })
                        svgRef.current?.setPointerCapture(e.pointerId)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        const poly = r.polygon as [number, number][]
                        if (poly.length <= 3) return
                        const next = poly.filter((_, j) => j !== i)
                        const { origin, width, depth } = rectFromVerts(next)
                        useStore
                          .getState()
                          .updateRoom(r.id, { polygon: next, origin, width, depth })
                      }}
                    />
                  )),
                ]
              : null}
            {(() => {
              // Progressive detail by on-screen room size: full (name +
              // area) → name only → hidden. Keeps the most important info
              // (the name) longest as the plan zooms out / shrinks. A
              // selected room always shows full so editing stays legible.
              // The "Labels" View toggle hides room name + dimensions
              // entirely (honoured even for the selected room).
              if (!showRoomLabels) return null
              const detail =
                isSel && tool === 'select' ? 'full' : roomLabelDetail(planRoomArea(r), PX)
              if (detail === 'none') return null
              const [lx, lz] = roomLabelPosition(r)
              const px = toPx(lx)
              const pz = toPx(lz)
              // Optional label rotation (radians → degrees, about the anchor)
              // and font-size multiplier — Sweet Home 3D label angle/font.
              const deg = r.labelAngle ? (r.labelAngle * 180) / Math.PI : 0
              const fontPx = roomFont * (r.labelFontScale ?? 1)
              // Wrap the name to the room's on-screen width so long names
              // (e.g. "Household Shelter") stay inside the room; over-long
              // words hyphenate. ~0.55·fontPx ≈ average glyph advance.
              const roomWidthM =
                r.polygon && r.polygon.length >= 3
                  ? Math.max(...r.polygon.map((p) => p[0])) -
                    Math.min(...r.polygon.map((p) => p[0]))
                  : r.width
              const maxChars = Math.max(4, Math.floor((roomWidthM * PX * 0.92) / (fontPx * 0.55)))
              const nameLines = wrapLabel(r.name, maxChars)
              const lineH = fontPx + 1
              const totalLines = nameLines.length + (detail === 'full' ? 2 : 0)
              // Vertically centre the multi-line block on the label anchor.
              const yTop = pz - ((totalLines - 1) * lineH) / 2
              return (
                <text
                  x={px}
                  y={yTop}
                  textAnchor="middle"
                  className="select-none"
                  fontSize={fontPx}
                  fill="var(--text-2)"
                  transform={deg ? `rotate(${deg} ${px} ${pz})` : undefined}
                  style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                  onPointerDown={(e) => {
                    if (tool !== 'select') return
                    const willMove = beginElementDrag(e, sel?.type === 'room' && sel.id === r.id)
                    setPlanSelection({ type: 'room', id: r.id })
                    if (!willMove) return
                    const [wx, wz] = pointerWorld(e)
                    setMovingRoomLabel({ id: r.id, gx: wx - lx, gz: wz - lz })
                  }}
                >
                  {nameLines.map((ln, i) => (
                    <tspan key={`${ln}-${i}`} x={px} dy={i === 0 ? 0 : lineH}>
                      {ln}
                    </tspan>
                  ))}
                  {detail === 'full' && (
                    <>
                      <tspan x={px} dy={lineH + 2} fill="var(--text-3)">
                        {formatArea(planRoomArea(r), units)}
                      </tspan>
                      <tspan x={px} dy={lineH} fill="var(--text-3)">
                        {`P ${formatLength(planRoomPerimeter(r), units)}`}
                      </tspan>
                    </>
                  )}
                </text>
              )
            })()}
          </g>
        )
      })}
    </>
  )
}
