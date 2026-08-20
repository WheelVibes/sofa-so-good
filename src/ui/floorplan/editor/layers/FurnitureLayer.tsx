import type React from 'react'
import { obbCorners } from '../../../../collision/obb'
import { itemFootprint } from '../../../../collision/placement'
import { itemPrice } from '../../../../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../../../../furniture/types'
import { enclosingRadius, pointerAngle } from '../../../../scene/selection/rotateGizmoMath'
import { useStore } from '../../../../state/store'
import { CategoryIcon } from '../../../catalog/CategoryIcon'
import { type PlanLabelMode, planLabelLines } from '../../planLabels'
import { CATEGORY_FILL, type Tool } from '../planConstants'

interface FurnitureLayerProps {
  /** Items on the active storey (already filtered). */
  items: FurnitureItem[]
  getDef: (id: FurnitureType) => FurnitureDef | undefined
  catalogRef: React.RefObject<Record<FurnitureType, FurnitureDef>>
  PX: number
  toPx: (m: number) => number
  tool: Tool
  editMode: 'view' | 'edit'
  fTilt: boolean
  fPrice: boolean
  labelsOn: boolean
  planLabels: PlanLabelMode
  selectedItemId: string | null
  selectedItemIds: Set<string>
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setMovingItem: (v: { id: string; gx: number; gz: number }) => void
  setRotatingMulti: (v: {
    cx: number
    cz: number
    a0: number
    originals: { id: string; position: [number, number]; rotation: number }[]
  }) => void
  setScalingMulti: (v: {
    pivot: [number, number]
    grabDist: number
    originals: { id: string; position: [number, number]; scale: number }[]
  }) => void
}

/**
 * The active storey's **furniture** layer of the 2D plan SVG — the top-down
 * footprints (fill + category glyph + tilt badge, click-to-select + drag), the
 * unified multi-select bounding box with rotation ring + corner scale handles
 * (2+ items), and the name/price labels. Extracted verbatim from
 * `FloorPlanEditor` as behaviour-preserving code-motion (MOD-FPE-SPLIT); the
 * parent still gates the whole layer on the "Furniture" visibility toggle.
 */
export function FurnitureLayer({
  items,
  getDef,
  catalogRef,
  PX,
  toPx,
  tool,
  editMode,
  fTilt,
  fPrice,
  labelsOn,
  planLabels,
  selectedItemId,
  selectedItemIds,
  beginElementDrag,
  pointerWorld,
  setMovingItem,
  setRotatingMulti,
  setScalingMulti,
}: FurnitureLayerProps) {
  return (
    <>
      {/* Furniture footprints — the live 3D layout, top-down, filtered to
        the active storey. Click to select (shared with 3D); drag (select
        tool) to move. */}
      {items.map((it) => {
        const def = getDef(it.defId)
        if (!def) return null
        const obb = itemFootprint(it, def)
        const corners = obbCorners(obb)
        const pts = corners.map(([x, z]) => `${toPx(x)},${toPx(z)}`).join(' ')
        // Tilt indicator (PARITY-TILT): a small badge on a footprint corner
        // when the piece is pitched/rolled out of plane.
        const tilted = fTilt && !!(it.pitch || it.roll)
        // Highlighted when it's the primary OR part of a marquee multi-selection.
        const isSel = selectedItemId === it.id || selectedItemIds.has(it.id)
        // Top-down category glyph centred in the footprint, shown only when no
        // text label covers the centre (labels off + not selected).
        const cx = toPx(it.position[0])
        const cy = toPx(it.position[1])
        const glyphPx = Math.min(Math.min(obb.hx, obb.hz) * 2 * PX * 0.55, 22)
        const showGlyph = !labelsOn && !isSel && glyphPx >= 9
        return (
          <g key={it.id}>
            <polygon
              data-item-id={it.id}
              data-item-selected={isSel ? '1' : undefined}
              points={pts}
              fill={
                isSel
                  ? 'var(--accent-soft)'
                  : (CATEGORY_FILL[def.category] ?? 'var(--plan-cat-others)')
              }
              fillOpacity={isSel ? 0.95 : 0.55}
              stroke={isSel ? 'var(--accent)' : 'var(--border-2)'}
              strokeWidth={isSel ? 2 : 1}
              strokeLinejoin="round"
              style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
              onPointerDown={(e) => {
                if (tool !== 'select') return
                const st = useStore.getState()
                // Dragging an item that's part of a multi-selection moves the
                // whole selection — so keep it; otherwise select just this one.
                const inMulti = st.selectedItemIds.length > 1 && st.selectedItemIds.includes(it.id)
                const willMove = beginElementDrag(e, selectedItemId === it.id || inMulti)
                if (!inMulti) st.selectItem(it.id)
                if (!willMove) return // view / unselected-on-touch: let it pan
                // Window-bound fixtures (curtains/blinds) are static on their
                // window — selectable (to inspect/unlock/resize) but never moved,
                // exactly like the 3D scene (`Furniture.tsx` `shouldBeginItemDrag`).
                // Dragging one would detach it from its window.
                if (def.windowBound || def.doorBound) return
                const [wx, wz] = pointerWorld(e)
                st.pushHistory()
                setMovingItem({ id: it.id, gx: wx - it.position[0], gz: wz - it.position[1] })
              }}
            />
            {showGlyph ? (
              <g
                transform={`translate(${cx - glyphPx / 2},${cy - glyphPx / 2})`}
                style={{ color: 'var(--text-2)', pointerEvents: 'none' }}
                opacity={0.7}
              >
                <CategoryIcon category={def.category} width={glyphPx} height={glyphPx} />
              </g>
            ) : null}
            {tilted ? (
              <g
                transform={`translate(${toPx(corners[0][0])},${toPx(corners[0][1])})`}
                pointerEvents="none"
              >
                <title>Tilted (pitch/roll)</title>
                <circle
                  r={7}
                  fill="var(--surface-solid)"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                />
                {/* Diagonal double-arrow = out-of-plane tilt. */}
                <path
                  d="M-3.4,3.4 L3.4,-3.4 M3.4,-3.4 l-2.5,0.15 M3.4,-3.4 l-0.15,2.5 M-3.4,3.4 l2.5,-0.15 M-3.4,3.4 l0.15,-2.5"
                  stroke="var(--accent)"
                  strokeWidth={1.2}
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            ) : null}
          </g>
        )
      })}

      {/* Unified multi-select bounding box + rotation ring (Canva parity):
          when 2+ furniture items are selected, one border encloses them all
          and a ring handle rotates the whole selection about its centroid. */}
      {(() => {
        const selItems = items.filter((i) => selectedItemIds.has(i.id))
        if (selItems.length < 2) return null
        let minX = Number.POSITIVE_INFINITY
        let minZ = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxZ = Number.NEGATIVE_INFINITY
        const centers: { cx: number; cz: number; halfDiag: number }[] = []
        for (const it of selItems) {
          const def = getDef(it.defId)
          if (!def) continue
          const obb = itemFootprint(it, def)
          let r = 0
          for (const [x, z] of obbCorners(obb)) {
            if (x < minX) minX = x
            if (z < minZ) minZ = z
            if (x > maxX) maxX = x
            if (z > maxZ) maxZ = z
            r = Math.max(r, Math.hypot(x - it.position[0], z - it.position[1]))
          }
          centers.push({ cx: it.position[0], cz: it.position[1], halfDiag: r })
        }
        if (!Number.isFinite(minX)) return null
        const cwx = (minX + maxX) / 2
        const cwz = (minZ + maxZ) / 2
        const ringR = enclosingRadius(cwx, cwz, centers) * PX + 14
        const cxp = toPx(cwx)
        const cyp = toPx(cwz)
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={toPx(minX)}
              y={toPx(minZ)}
              width={(maxX - minX) * PX}
              height={(maxZ - minZ) * PX}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              rx={2}
            />
            {tool === 'select' && editMode === 'edit' ? (
              <>
                <circle
                  cx={cxp}
                  cy={cyp}
                  r={ringR}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1}
                  strokeOpacity={0.5}
                />
                <circle
                  cx={cxp}
                  cy={cyp - ringR}
                  r={7}
                  fill="var(--accent)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  style={{ cursor: 'grab', pointerEvents: 'all' }}
                  onPointerDown={(e) => {
                    if (tool !== 'select' || editMode !== 'edit') return
                    if (!beginElementDrag(e, true)) return
                    const [wx, wz] = pointerWorld(e)
                    const st = useStore.getState()
                    st.pushHistory()
                    setRotatingMulti({
                      cx: cwx,
                      cz: cwz,
                      a0: pointerAngle(cwx, cwz, wx, wz),
                      originals: st.items
                        .filter((m) => selectedItemIds.has(m.id))
                        .map((m) => ({
                          id: m.id,
                          position: [...m.position] as [number, number],
                          rotation: m.rotation,
                        })),
                    })
                  }}
                />
                {/* Corner resize handles — drag to scale the whole selection
                    about the opposite corner (uniform). */}
                {(
                  [
                    ['nw', minX, minZ, maxX, maxZ],
                    ['ne', maxX, minZ, minX, maxZ],
                    ['se', maxX, maxZ, minX, minZ],
                    ['sw', minX, maxZ, maxX, minZ],
                  ] as const
                ).map(([key, hxw, hzw, pxw, pzw]) => (
                  <rect
                    key={key}
                    x={toPx(hxw) - 5}
                    y={toPx(hzw) - 5}
                    width={10}
                    height={10}
                    rx={2}
                    fill="var(--surface)"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    style={{
                      cursor: key === 'nw' || key === 'se' ? 'nwse-resize' : 'nesw-resize',
                      pointerEvents: 'all',
                    }}
                    onPointerDown={(e) => {
                      if (tool !== 'select' || editMode !== 'edit') return
                      if (!beginElementDrag(e, true)) return
                      const [wx, wz] = pointerWorld(e)
                      const st = useStore.getState()
                      st.pushHistory()
                      const pivot: [number, number] = [pxw, pzw]
                      setScalingMulti({
                        pivot,
                        grabDist: Math.max(0.05, Math.hypot(wx - pivot[0], wz - pivot[1])),
                        originals: st.items
                          .filter((m) => selectedItemIds.has(m.id))
                          .map((m) => {
                            const d = catalogRef.current[m.defId]
                            const defScale = d && d.kind !== 'parametric' ? d.scale : undefined
                            return {
                              id: m.id,
                              position: [...m.position] as [number, number],
                              scale:
                                (typeof m.props.scale === 'number' ? m.props.scale : defScale) ?? 1,
                            }
                          }),
                      })
                    }}
                  />
                ))}
              </>
            ) : null}
          </g>
        )
      })()}

      {/* Furniture labels. When the Labels toggle is on, every footprint shows
        its name (+ price); otherwise just the selected one. */}
      {(() => {
        const labelled = labelsOn ? items : items.filter((i) => i.id === selectedItemId)
        return labelled.map((it) => {
          const def = getDef(it.defId)
          const name = it.label ?? def?.name
          if (!name) return null
          const variant = typeof it.props.variant === 'string' ? it.props.variant : undefined
          const price =
            fPrice && def ? itemPrice(def, def.category, variant, it.meta?.price) : undefined
          const lines = labelsOn ? planLabelLines(name, price, planLabels) : [name]
          if (lines.length === 0) return null
          const cx = toPx(it.position[0])
          const cy = toPx(it.position[1])
          return (
            <text
              key={it.id}
              x={cx}
              y={cy - (lines.length - 1) * 6}
              textAnchor="middle"
              dominantBaseline="middle"
              className="plan-item-label"
              style={{
                pointerEvents: 'none',
                fontSize: 11,
                fontWeight: 700,
                fill: 'var(--text)',
                paintOrder: 'stroke',
                stroke: 'var(--surface)',
                strokeWidth: 3,
                strokeLinejoin: 'round',
              }}
            >
              {lines.map((ln, i) => (
                <tspan key={ln} x={cx} dy={i === 0 ? 0 : 12} fontWeight={i === 0 ? 700 : 600}>
                  {ln}
                </tspan>
              ))}
            </text>
          )
        })
      })()}
    </>
  )
}
