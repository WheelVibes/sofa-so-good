import type React from 'react'
import { itemFootprint } from '../../../../collision/placement'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../../../../furniture/types'
import { pointerAngle } from '../../../../scene/selection/rotateGizmoMath'
import { useStore } from '../../../../state/store'

interface FurnitureRotateHandleProps {
  /** The single selected item (or null → renders nothing). */
  item: FurnitureItem | null | undefined
  getDef: (id: FurnitureType) => FurnitureDef | undefined
  PX: number
  toPx: (m: number) => number
  beginElementDrag: (e: React.PointerEvent, isSelectedNow: boolean) => boolean
  pointerWorld: (e: React.PointerEvent) => [number, number]
  setRotatingItem: (v: { id: string; cx: number; cz: number; startRot: number; a0: number }) => void
}

/**
 * The **single-selected furniture rotate handle** of the 2D plan SVG — a ring +
 * facing knob around the chosen footprint; drag to spin the piece about its
 * centre (15°-snap, Shift for free). Extracted verbatim from `FloorPlanEditor`
 * as behaviour-preserving code-motion (MOD-FPE-SPLIT); the parent still gates on
 * the Furniture toggle + edit mode + select tool + a live selection.
 *
 * Window-bound fixtures (curtains/blinds) are static on their window — the 3D
 * inspector hides the rotate action + the scene drag is blocked, so the plan
 * rotate knob must be absent too (spinning it would detach the fixture from its
 * window). Mirrors `def.windowBound` gating in `InspectorPanel`/`Furniture.tsx`.
 */
export function FurnitureRotateHandle({
  item,
  getDef,
  PX,
  toPx,
  beginElementDrag,
  pointerWorld,
  setRotatingItem,
}: FurnitureRotateHandleProps) {
  if (!item || item.locked) return null
  const def = getDef(item.defId)
  if (!def || def.windowBound) return null
  const obb = itemFootprint(item, def)
  const cx = toPx(obb.cx)
  const cy = toPx(obb.cz)
  // Ring clears the footprint (half-diagonal + gap), with a px floor so tiny
  // pieces still get a grabbable ring.
  const ringR = Math.max(Math.hypot(obb.hx, obb.hz) * PX + 16, 28)
  // Knob at the item's facing (+Z): world facing unit = (sin, cos).
  const kx = cx + Math.sin(item.rotation) * ringR
  const ky = cy + Math.cos(item.rotation) * ringR
  const startRotate = (e: React.PointerEvent) => {
    if (!beginElementDrag(e, true)) return
    const [gx, gz] = pointerWorld(e)
    useStore.getState().pushHistory()
    setRotatingItem({
      id: item.id,
      cx: obb.cx,
      cz: obb.cz,
      startRot: item.rotation,
      a0: pointerAngle(obb.cx, obb.cz, gx, gz),
    })
  }
  return (
    <g key={`rot-${item.id}`}>
      {/* Fat transparent grab ring — generous touch target; only the stroke is
        interactive so the interior stays click-through. */}
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: 'grab', pointerEvents: 'stroke' }}
        onPointerDown={startRotate}
      />
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke="var(--accent)"
        strokeOpacity={0.5}
        strokeWidth={2}
        strokeDasharray="4 4"
        style={{ pointerEvents: 'none' }}
      />
      {/* Spoke + knob at the item's facing, doubling as a heading cue. */}
      <line
        x1={cx}
        y1={cy}
        x2={kx}
        y2={ky}
        stroke="var(--accent)"
        strokeOpacity={0.5}
        strokeWidth={1.5}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        data-rot-handle={item.id}
        cx={kx}
        cy={ky}
        r={7}
        fill="var(--surface-solid)"
        stroke="var(--accent)"
        strokeWidth={2}
        style={{ cursor: 'grab' }}
        onPointerDown={startRotate}
      />
    </g>
  )
}
